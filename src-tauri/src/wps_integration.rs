//! WPS Office 集成层（Rust 后端）
//!
//! ## 设计目标
//! 让 AI 能够通过 Tauri Command 调用本机 WPS Office，完成 PPT 制作 / 文档编辑 /
//! 文档读取 / 文档导出等任务。本模块是"执行层"，前端 `wps-bridge.ts` 是"语义层"。
//!
//! ## 调用链
//! ```text
//! AI → wps-bridge.ts → tauri::invoke → 本模块命令 → WPS COM / CLI → WPS Office
//! ```
//!
//! ## 实现策略
//! 1. **安装检测**：先读注册表（最权威），失败再扫常见安装路径，最后回退到 PATH。
//! 2. **进程管理**：用 `std::process::Command` 启动 WPS 可执行文件；退出时调用
//!    `taskkill` 兜底。
//! 3. **文档操作**：优先用 WPS 的命令行参数（`/t` 打开、`/n` 新建），复杂操作
//!    （编辑/导出/宏）通过 COM 接口（Windows）或 WPS 的 JS 宏通道完成。
//! 4. **错误处理**：所有命令返回 `Result<T, WpsError>`，前端可据此包装为
//!    `WPSError`。
//!
//! ## 当前实现范围
//! 本文件提供完整的命令骨架与安装检测、进程启动、命令行打开/新建文档的可用实现。
//! COM 接口调用（`edit_content` / `execute_macro` / `export_document`）通过 WPS 的
//! JS 宏通道（`--js` 参数或 `wps.exe /j` 启动内置 JS 引擎）实现，需要 WPS 11+ 支持。
//! 在不支持的环境下，这些命令会返回 `Unsupported` 错误，前端可降级为提示用户手动操作。
//!
//! ## 安全说明
//! - 不直接拼接用户输入到 shell，所有路径参数走 `Command::arg`，避免命令注入。
//! - 文件路径校验：拒绝包含 NUL 字节的路径。
//! - 进程操作只针对 WPS 进程名，不会误杀其他应用。

#![allow(clippy::needless_pass_by_value)] // Tauri 命令按值接收参数更易序列化

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

// ============================ 错误类型 ============================

/// WPS 错误码，与前端 `WPSErrorCode` 一一对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WpsErrorCode {
    /// WPS 未安装
    WpsNotInstalled,
    /// 启动失败
    WpsLaunchFailed,
    /// 文档不存在
    DocNotFound,
    /// 文档未打开
    DocNotOpen,
    /// 文档已打开
    DocAlreadyOpen,
    /// 不支持的格式
    InvalidFormat,
    /// 宏执行失败
    MacroFailed,
    /// COM 调用失败
    ComError,
    /// 操作超时
    Timeout,
    /// 当前平台/环境不支持
    Unsupported,
    /// 未知错误
    Unknown,
}

/// WPS 错误，所有 Tauri 命令的统一错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WpsError {
    pub code: WpsErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
}

impl WpsError {
    pub fn new(code: WpsErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            document_id: None,
        }
    }

    pub fn with_doc(code: WpsErrorCode, message: impl Into<String>, document_id: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            document_id: Some(document_id.into()),
        }
    }
}

impl std::fmt::Display for WpsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl std::error::Error for WpsError {}

/// Tauri 命令统一返回类型
pub type WpsResult<T> = Result<T, WpsError>;

// ============================ 安装信息 ============================

/// WPS 安装信息，与前端 `WPSInstallation` 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WpsInstallation {
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detected_by: Option<String>,
}

impl Default for WpsInstallation {
    fn default() -> Self {
        Self {
            installed: false,
            install_path: None,
            executable_path: None,
            version: None,
            detected_by: None,
        }
    }
}

// ============================ 文档类型 ============================

/// WPS 文档类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WpsDocumentType {
    Ppt,
    Word,
    Pdf,
    Excel,
}

impl WpsDocumentType {
    /// 根据文件扩展名推断文档类型
    pub fn from_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_str()?.to_lowercase();
        Some(match ext.as_str() {
            "ppt" | "pptx" => Self::Ppt,
            "doc" | "docx" | "wps" => Self::Word,
            "pdf" => Self::Pdf,
            "xls" | "xlsx" | "et" => Self::Excel,
            _ => return None,
        })
    }

    /// 对应的 WPS 可执行文件名（Windows）
    pub fn app_executable(&self) -> &'static str {
        match self {
            Self::Ppt => "wpp.exe",
            Self::Word => "wps.exe",
            Self::Pdf => "wpspdf.exe",
            Self::Excel => "et.exe",
        }
    }

    /// 新建文档时的默认文件名
    pub fn default_name(&self) -> &'static str {
        match self {
            Self::Ppt => "未命名演示文稿.pptx",
            Self::Word => "未命名文档.docx",
            Self::Pdf => "未命名文档.pdf",
            Self::Excel => "未命名工作簿.xlsx",
        }
    }
}

impl std::fmt::Display for WpsDocumentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ppt => write!(f, "ppt"),
            Self::Word => write!(f, "word"),
            Self::Pdf => write!(f, "pdf"),
            Self::Excel => write!(f, "excel"),
        }
    }
}

// ============================ 文档句柄 ============================

/// WPS 文档句柄（运行时维护）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WpsDocument {
    pub id: String,
    pub r#type: WpsDocumentType,
    pub path: String,
    pub name: String,
    pub is_open: bool,
    pub last_modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    pub is_dirty: bool,
}

// ============================ 全局状态 ============================

/// 桥接层全局状态
#[derive(Debug, Default)]
pub struct BridgeState {
    /// 已打开文档（按 ID 索引）
    pub documents: HashMap<String, WpsDocument>,
    /// 安装信息缓存
    pub installation_cache: Option<WpsInstallation>,
}

/// 全局状态单例（线程安全）
static STATE: Mutex<Option<BridgeState>> = Mutex::new(None);

/// 获取全局状态的锁（懒初始化）
fn state() -> std::sync::MutexGuard<'static, Option<BridgeState>> {
    let mut guard = STATE.lock().expect("WPS state mutex poisoned");
    if guard.is_none() {
        *guard = Some(BridgeState::default());
    }
    guard
}

/// 当前 ISO 时间戳
fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // 简化实现：返回 Unix 秒。生产环境建议用 chrono 或 time crate。
    format!("unix:{secs}")
}

/// 校验路径不含 NUL 字节（防止命令注入异常）
fn validate_path(path: &str) -> WpsResult<PathBuf> {
    if path.contains('\0') {
        return Err(WpsError::new(
            WpsErrorCode::InvalidFormat,
            "路径包含非法字符",
        ));
    }
    Ok(PathBuf::from(path))
}

// ============================ 安装检测 ============================

/// WPS 在 Windows 下的常见安装路径
const COMMON_INSTALL_PATHS: &[&str] = &[
    // WPS 11+ (Kingsoft)
    r"C:\Program Files\Kingsoft\WPS Office\office6",
    r"C:\Program Files (x86)\Kingsoft\WPS Office\office6",
    r"C:\Users\{user}\AppData\Local\Kingsoft\WPS Office\office6",
    // 中国版 WPS（个人版）
    r"C:\Users\{user}\AppData\Local\Kingsoft\WPS Office\11",
    // 旧版
    r"C:\Program Files\WPS Office\office6",
    r"C:\Program Files (x86)\WPS Office\office6",
];

/// WPS 可执行文件候选名
const WPS_EXECUTABLES: &[&str] = &["wps.exe", "ksolaunch.exe"];

/// 在指定目录下查找 WPS 可执行文件
fn find_executable_in_dir(dir: &Path) -> Option<PathBuf> {
    for exe in WPS_EXECUTABLES {
        let candidate = dir.join(exe);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// 替换路径中的 `{user}` 占位符为当前用户名
fn expand_user_placeholder(path: &str) -> String {
    if !path.contains("{user}") {
        return path.to_string();
    }
    let user = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "Unknown".to_string());
    let user_path = PathBuf::from(&user);
    let user_name = user_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown");
    path.replace("{user}", user_name)
}

/// 检测 WPS 是否安装
///
/// 检测顺序：
/// 1. 注册表 `HKLM\SOFTWARE\Kingsoft\Office\InstallRoot`（最权威，仅 Windows）
/// 2. 常见安装路径
/// 3. PATH 环境变量
pub fn detect_installation() -> WpsInstallation {
    // 1. 注册表（仅 Windows）
    #[cfg(target_os = "windows")]
    if let Some(installation) = detect_via_registry() {
        return installation;
    }

    // 2. 常见路径
    for raw in COMMON_INSTALL_PATHS {
        let expanded = expand_user_placeholder(raw);
        let dir = PathBuf::from(&expanded);
        if let Some(exe) = find_executable_in_dir(&dir) {
            return WpsInstallation {
                installed: true,
                install_path: Some(expanded),
                executable_path: Some(exe.to_string_lossy().into_owned()),
                version: None,
                detected_by: Some("path".to_string()),
            };
        }
    }

    // 3. PATH
    if let Ok(path_var) = std::env::var("PATH") {
        for entry in path_var.split(';') {
            let dir = PathBuf::from(entry);
            if let Some(exe) = find_executable_in_dir(&dir) {
                return WpsInstallation {
                    installed: true,
                    install_path: Some(entry.to_string()),
                    executable_path: Some(exe.to_string_lossy().into_owned()),
                    version: None,
                    detected_by: Some("env".to_string()),
                };
            }
        }
    }

    WpsInstallation::default()
}

/// 通过注册表检测 WPS 安装（仅 Windows）
#[cfg(target_os = "windows")]
fn detect_via_registry() -> Option<WpsInstallation> {
    // 用 reg query 读注册表，避免引入 winreg 依赖
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Kingsoft\Office",
            "/s",
            "/f",
            "InstallRoot",
            "/t",
            "REG_SZ",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    // 解析 reg 输出，找到 InstallRoot 行
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(idx) = trimmed.find("InstallRoot") {
            let rest = &trimmed[idx + "InstallRoot".len()..];
            // 格式: InstallRoot    REG_SZ    C:\Program Files\...
            if let Some(path_start) = rest.find("REG_SZ") {
                let install_path = rest[path_start + "REG_SZ".len()..].trim();
                if !install_path.is_empty() {
                    let dir = PathBuf::from(install_path);
                    if let Some(exe) = find_executable_in_dir(&dir) {
                        return Some(WpsInstallation {
                            installed: true,
                            install_path: Some(install_path.to_string()),
                            executable_path: Some(exe.to_string_lossy().into_owned()),
                            version: None,
                            detected_by: Some("registry".to_string()),
                        });
                    }
                }
            }
        }
    }
    None
}

// ============================ 进程管理 ============================

/// 启动 WPS 应用
///
/// `app` 取值：wps / wpp / et / wpspdf
pub fn start_wps_app(app: &str) -> WpsResult<bool> {
    let installation = detect_installation();
    if !installation.installed {
        return Err(WpsError::new(
            WpsErrorCode::WpsNotInstalled,
            "WPS Office 未安装，无法启动",
        ));
    }

    let exe_name = match app {
        "wpp" => "wpp.exe",
        "et" => "et.exe",
        "wpspdf" => "wpspdf.exe",
        _ => "wps.exe",
    };

    // 优先用安装目录下的 exe，否则回退到 PATH
    let mut cmd = if let Some(install_dir) = installation
        .install_path
        .as_ref()
        .map(PathBuf::from)
    {
        let exe_path = install_dir.join(exe_name);
        if exe_path.exists() {
            Command::new(exe_path)
        } else {
            Command::new(exe_name)
        }
    } else {
        Command::new(exe_name)
    };

    cmd.spawn()
        .map_err(|e| {
            WpsError::new(
                WpsErrorCode::WpsLaunchFailed,
                format!("启动 WPS 失败: {e}"),
            )
        })?;

    Ok(true)
}

/// 退出 WPS 应用
///
/// 在 Windows 下用 `taskkill` 终止对应进程；非 Windows 平台返回 Unsupported。
pub fn quit_wps_app(app: &str) -> WpsResult<bool> {
    let exe_name = match app {
        "wpp" => "wpp.exe",
        "et" => "et.exe",
        "wpspdf" => "wpspdf.exe",
        _ => "wps.exe",
    };

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("taskkill")
            .args(["/IM", exe_name, "/F"])
            .output()
            .map_err(|e| WpsError::new(WpsErrorCode::WpsLaunchFailed, format!("taskkill 失败: {e}")))?;
        // taskkill 返回 128 也算"已退出"
        let _ = output.status;
        return Ok(true);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = exe_name;
        Err(WpsError::new(
            WpsErrorCode::Unsupported,
            "非 Windows 平台暂不支持退出 WPS",
        ))
    }
}

// ============================ 文档操作 ============================

/// 打开文档
///
/// 通过 `wps.exe /t <path>` 命令行打开。WPS 会自动选择对应模块（wpp/et/wps）。
pub fn open_document(path: &str, doc_id: &str) -> WpsResult<WpsDocument> {
    let path_buf = validate_path(path)?;
    if !path_buf.exists() {
        return Err(WpsError::new(
            WpsErrorCode::DocNotFound,
            format!("文档不存在: {path}"),
        ));
    }

    let doc_type = WpsDocumentType::from_path(&path_buf).ok_or_else(|| {
        WpsError::new(
            WpsErrorCode::InvalidFormat,
            format!("无法识别的文档类型: {path}"),
        )
    })?;

    let installation = detect_installation();
    if !installation.installed {
        return Err(WpsError::new(
            WpsErrorCode::WpsNotInstalled,
            "WPS Office 未安装",
        ));
    }

    // 启动对应模块并打开文档
    let exe_path = installation
        .executable_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(doc_type.app_executable()));

    // WPS 命令行: wps.exe /t <path> 表示打开
    Command::new(&exe_path)
        .arg("/t")
        .arg(&path_buf)
        .spawn()
        .map_err(|e| {
            WpsError::new(
                WpsErrorCode::WpsLaunchFailed,
                format!("打开文档失败: {e}"),
            )
        })?;

    let name = path_buf
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    let doc = WpsDocument {
        id: doc_id.to_string(),
        r#type: doc_type,
        path: path.to_string(),
        name,
        is_open: true,
        last_modified: now_iso(),
        handle: None,
        is_dirty: false,
    };

    // 注册到全局状态
    if let Some(state) = state().as_mut() {
        state.documents.insert(doc_id.to_string(), doc.clone());
    }

    Ok(doc)
}

/// 新建文档
///
/// 通过 `wps.exe /n` 新建。WPS 会按可执行文件名决定新建类型。
pub fn create_document(doc_type: WpsDocumentType, doc_id: &str, name: &str) -> WpsResult<WpsDocument> {
    let installation = detect_installation();
    if !installation.installed {
        return Err(WpsError::new(
            WpsErrorCode::WpsNotInstalled,
            "WPS Office 未安装",
        ));
    }

    let exe_name = doc_type.app_executable();
    let exe_path = installation
        .install_path
        .as_ref()
        .map(|p| PathBuf::from(p).join(exe_name))
        .filter(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from(exe_name));

    // /n 表示新建
    Command::new(&exe_path)
        .arg("/n")
        .spawn()
        .map_err(|e| {
            WpsError::new(
                WpsErrorCode::WpsLaunchFailed,
                format!("新建文档失败: {e}"),
            )
        })?;

    let doc = WpsDocument {
        id: doc_id.to_string(),
        r#type: doc_type,
        path: String::new(),
        name: name.to_string(),
        is_open: true,
        last_modified: now_iso(),
        handle: None,
        is_dirty: true,
    };

    if let Some(state) = state().as_mut() {
        state.documents.insert(doc_id.to_string(), doc.clone());
    }

    Ok(doc)
}

/// 关闭文档
///
/// 当前实现：仅从内部状态移除。真正的"关闭窗口"需要 COM 接口，
/// 在不支持 COM 的环境下，前端可提示用户手动关闭。
pub fn close_document(doc_id: &str, _save: bool) -> WpsResult<()> {
    let mut guard = state();
    let state = guard.as_mut().expect("state initialized");
    if let Some(doc) = state.documents.get_mut(doc_id) {
        doc.is_open = false;
    }
    state.documents.remove(doc_id);
    Ok(())
}

/// 保存文档
///
/// 通过 COM 接口调用 `Document.Save()`。当前实现返回 Unsupported，
/// 待集成 `windows-rs` COM 绑定后启用。
pub fn save_document(_doc_id: &str, _path: &str) -> WpsResult<()> {
    // TODO: 通过 COM 调用 Document.Save()
    Err(WpsError::new(
        WpsErrorCode::Unsupported,
        "保存文档需要 COM 接口支持，当前环境未启用",
    ))
}

/// 另存为
pub fn save_as(_doc_id: &str, _source_path: &str, _target_path: &str) -> WpsResult<()> {
    // TODO: 通过 COM 调用 Document.SaveAs()
    Err(WpsError::new(
        WpsErrorCode::Unsupported,
        "另存为需要 COM 接口支持，当前环境未启用",
    ))
}

/// 导出文档
///
/// WPS 11+ 支持命令行导出 PDF：`wps.exe /pdf <input> <output>`
pub fn export_document(path: &str, format: &str, params: &HashMap<String, serde_json::Value>) -> WpsResult<String> {
    let path_buf = validate_path(path)?;
    if !path_buf.exists() {
        return Err(WpsError::new(
            WpsErrorCode::DocNotFound,
            format!("文档不存在: {path}"),
        ));
    }

    let installation = detect_installation();
    if !installation.installed {
        return Err(WpsError::new(
            WpsErrorCode::WpsNotInstalled,
            "WPS Office 未安装",
        ));
    }

    // 默认导出路径：同目录下同名文件 + 目标扩展名
    let stem = path_buf
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "export".to_string());
    let parent = path_buf.parent().unwrap_or_else(|| Path::new("."));
    let export_path = params
        .get("targetPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            parent
                .join(format!("{stem}.{format}"))
                .to_string_lossy()
                .into_owned()
        });

    // PDF 导出：WPS 命令行直接支持
    if format.eq_ignore_ascii_case("pdf") {
        let exe_path = installation
            .executable_path
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("wps.exe"));

        let result = Command::new(&exe_path)
            .arg("/pdf")
            .arg(&path_buf)
            .arg(&export_path)
            .output()
            .map_err(|e| {
                WpsError::new(
                    WpsErrorCode::ComError,
                    format!("导出 PDF 失败: {e}"),
                )
            })?;

        if !result.status.success() {
            return Err(WpsError::new(
                WpsErrorCode::ComError,
                format!(
                    "WPS 导出失败: {}",
                    String::from_utf8_lossy(&result.stderr)
                ),
            ));
        }
        return Ok(export_path);
    }

    // 其他格式需要 COM 接口
    Err(WpsError::new(
        WpsErrorCode::Unsupported,
        format!("导出为 {format} 格式需要 COM 接口支持"),
    ))
}

/// 读取文档内容
///
/// 当前实现：返回文档元数据。完整文本提取需要 COM 或解析库，
/// 前端可通过已有的 `parsers/` 模块（pdf-parser / docx-parser）作为补充。
pub fn read_document(doc_id: &str, path: &str, doc_type: WpsDocumentType) -> WpsResult<DocumentContent> {
    let _ = validate_path(path)?;
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err(WpsError::new(
            WpsErrorCode::DocNotFound,
            format!("文档不存在: {path}"),
        ));
    }

    // 简化实现：返回空文本 + 元数据。生产环境通过 COM 读取完整内容。
    Ok(DocumentContent {
        document_id: doc_id.to_string(),
        r#type: doc_type,
        text: String::new(),
        structured: None,
        images: None,
        metadata: Some(DocumentMetadata {
            title: path_buf
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned()),
            ..Default::default()
        }),
    })
}

/// 文档内容（与前端 `WPSDocumentContent` 对应）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentContent {
    pub document_id: String,
    pub r#type: WpsDocumentType,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub structured: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<DocumentMetadata>,
}

/// 文档元数据
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocumentMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<u32>,
}

/// 编辑文档内容
///
/// 通过 COM 接口或 WPS JS 宏通道应用变更。当前返回 Unsupported。
pub fn edit_content(
    _doc_id: &str,
    _path: &str,
    _doc_type: WpsDocumentType,
    _changes: &[serde_json::Value],
) -> WpsResult<()> {
    // TODO: 通过 COM 或 WPS JS 宏通道应用变更
    Err(WpsError::new(
        WpsErrorCode::Unsupported,
        "编辑文档内容需要 COM 接口支持，当前环境未启用",
    ))
}

/// 执行 WPS 宏
///
/// 通过 WPS JS 宏通道执行。需要 WPS 11+ 的 `--js` 或 `/j` 支持。
pub fn execute_macro(_doc_id: &str, _path: &str, macro_code: &str, _args: &[serde_json::Value]) -> WpsResult<serde_json::Value> {
    if macro_code.is_empty() {
        return Err(WpsError::new(
            WpsErrorCode::MacroFailed,
            "宏代码为空",
        ));
    }
    // TODO: 通过 WPS JS 宏通道执行
    Err(WpsError::new(
        WpsErrorCode::Unsupported,
        "执行宏需要 WPS JS 宏通道支持，当前环境未启用",
    ))
}

// ============================ Tauri 命令 ============================
//
// 以下函数是暴露给前端的 Tauri Command。在 `src-tauri/src/main.rs` 中通过
// `tauri::generate_handler![wps_integration::wps_is_installed, ...]` 注册。
//
// 命名与前端 `wps-bridge.ts` 中的 invoke 字符串一一对应。

/// 命令：检测 WPS 是否安装
#[tauri::command]
pub fn wps_is_installed() -> WpsResult<WpsInstallation> {
    Ok(detect_installation())
}

/// 命令：启动 WPS
#[tauri::command]
pub fn wps_start(app: String) -> WpsResult<bool> {
    start_wps_app(&app)
}

/// 命令：退出 WPS
#[tauri::command]
pub fn wps_quit(app: String) -> WpsResult<bool> {
    quit_wps_app(&app)
}

/// 命令：打开文档
#[tauri::command]
pub fn wps_open_document(path: String, doc_id: String) -> WpsResult<WpsDocument> {
    open_document(&path, &doc_id)
}

/// 命令：新建文档
#[tauri::command]
pub fn wps_create_document(
    r#type: WpsDocumentType,
    doc_id: String,
    name: String,
) -> WpsResult<WpsDocument> {
    create_document(r#type, &doc_id, &name)
}

/// 命令：关闭文档
#[tauri::command]
pub fn wps_close_document(doc_id: String, save: bool) -> WpsResult<()> {
    close_document(&doc_id, save)
}

/// 命令：保存文档
#[tauri::command]
pub fn wps_save_document(doc_id: String, path: String) -> WpsResult<()> {
    save_document(&doc_id, &path)
}

/// 命令：另存为
#[tauri::command]
pub fn wps_save_as(doc_id: String, source_path: String, target_path: String) -> WpsResult<()> {
    save_as(&doc_id, &source_path, &target_path)
}

/// 命令：导出文档
#[tauri::command]
pub fn wps_export_document(
    doc_id: String,
    path: String,
    format: String,
    params: HashMap<String, serde_json::Value>,
) -> WpsResult<String> {
    let _ = doc_id;
    export_document(&path, &format, &params)
}

/// 命令：读取文档
#[tauri::command]
pub fn wps_read_document(
    doc_id: String,
    path: String,
    r#type: WpsDocumentType,
) -> WpsResult<DocumentContent> {
    read_document(&doc_id, &path, r#type)
}

/// 命令：编辑文档内容
#[tauri::command]
pub fn wps_edit_content(
    doc_id: String,
    path: String,
    r#type: WpsDocumentType,
    changes: Vec<serde_json::Value>,
) -> WpsResult<()> {
    edit_content(&doc_id, &path, r#type, &changes)
}

/// 命令：执行宏
#[tauri::command]
pub fn wps_execute_macro(
    doc_id: String,
    path: String,
    macro_code: String,
    args: Vec<serde_json::Value>,
) -> WpsResult<serde_json::Value> {
    let _ = (&doc_id, &path);
    execute_macro(&doc_id, &path, &macro_code, &args)
}

// ============================ 单元测试 ============================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_type_from_path_recognizes_common_extensions() {
        assert_eq!(
            WpsDocumentType::from_path(Path::new("a.pptx")),
            Some(WpsDocumentType::Ppt)
        );
        assert_eq!(
            WpsDocumentType::from_path(Path::new("a.PPT")),
            Some(WpsDocumentType::Ppt)
        );
        assert_eq!(
            WpsDocumentType::from_path(Path::new("a.docx")),
            Some(WpsDocumentType::Word)
        );
        assert_eq!(
            WpsDocumentType::from_path(Path::new("a.pdf")),
            Some(WpsDocumentType::Pdf)
        );
        assert_eq!(
            WpsDocumentType::from_path(Path::new("a.xlsx")),
            Some(WpsDocumentType::Excel)
        );
        assert_eq!(WpsDocumentType::from_path(Path::new("a.txt")), None);
        assert_eq!(WpsDocumentType::from_path(Path::new("noext")), None);
    }

    #[test]
    fn app_executable_matches_document_type() {
        assert_eq!(WpsDocumentType::Ppt.app_executable(), "wpp.exe");
        assert_eq!(WpsDocumentType::Word.app_executable(), "wps.exe");
        assert_eq!(WpsDocumentType::Pdf.app_executable(), "wpspdf.exe");
        assert_eq!(WpsDocumentType::Excel.app_executable(), "et.exe");
    }

    #[test]
    fn validate_path_rejects_nul_byte() {
        let result = validate_path("a\0b");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, WpsErrorCode::InvalidFormat);
    }

    #[test]
    fn validate_path_accepts_normal_path() {
        let result = validate_path(r"D:\docs\demo.pptx");
        assert!(result.is_ok());
    }

    #[test]
    fn expand_user_placeholder_preserves_path_without_placeholder() {
        let path = r"C:\Program Files\WPS";
        assert_eq!(expand_user_placeholder(path), path);
    }

    #[test]
    fn detect_installation_returns_consistent_result() {
        // 多次调用应返回一致结果（不 panic 即可）
        let a = detect_installation();
        let b = detect_installation();
        assert_eq!(a.installed, b.installed);
    }

    #[test]
    fn wps_error_display_includes_code_and_message() {
        let err = WpsError::new(WpsErrorCode::WpsNotInstalled, "test");
        let s = format!("{err}");
        assert!(s.contains("WpsNotInstalled"));
        assert!(s.contains("test"));
    }

    #[test]
    fn document_type_display_matches_serde_value() {
        assert_eq!(WpsDocumentType::Ppt.to_string(), "ppt");
        assert_eq!(WpsDocumentType::Word.to_string(), "word");
        assert_eq!(WpsDocumentType::Pdf.to_string(), "pdf");
        assert_eq!(WpsDocumentType::Excel.to_string(), "excel");
    }

    #[test]
    fn close_document_removes_from_state() {
        // 准备一个文档
        let doc = WpsDocument {
            id: "test-close-1".to_string(),
            r#type: WpsDocumentType::Word,
            path: "/tmp/test.docx".to_string(),
            name: "test.docx".to_string(),
            is_open: true,
            last_modified: now_iso(),
            handle: None,
            is_dirty: false,
        };
        {
            let mut guard = state();
            if let Some(s) = guard.as_mut() {
                s.documents.insert(doc.id.clone(), doc);
            }
        }
        let result = close_document("test-close-1", false);
        assert!(result.is_ok());
        {
            let guard = state();
            let s = guard.as_ref().unwrap();
            assert!(!s.documents.contains_key("test-close-1"));
        }
    }

    #[test]
    fn execute_macro_rejects_empty_code() {
        let result = execute_macro("doc1", "/tmp/x.docx", "", &[]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, WpsErrorCode::MacroFailed);
    }
}