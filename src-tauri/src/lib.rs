use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use reqwest::blocking::Client;
use std::io::Write;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::{Engine, engine::general_purpose};
use tauri::Emitter;


mod wps_integration;

/// 数据目录下的子目录结构
const SUB_DIRS: [&str; 7] = ["knowledge", "annotations", "ideas", "research", "templates", "memory", "knowledge-materials"];

/// 获取固定数据目录路径
/// Windows: D:\code\llm-wiki-data
/// 其他系统: ~/code/llm-wiki-data
#[tauri::command]
fn get_data_dir() -> String {
    if cfg!(target_os = "windows") {
        "D:\\code\\llm-wiki-data".to_string()
    } else {
        dirs::home_dir()
            .map(|h| h.join("code").join("llm-wiki-data").to_string_lossy().to_string())
            .unwrap_or_else(|| "./code/llm-wiki-data".to_string())
    }
}

/// 确保数据目录及子目录存在，返回数据目录路径
#[tauri::command]
fn ensure_data_dir() -> Result<String, String> {
    let data_dir = get_data_dir();
    let root = PathBuf::from(&data_dir);

    // 创建根目录
    fs::create_dir_all(&root).map_err(|e| format!("创建数据目录失败: {}", e))?;

    // 创建子目录结构
    for subdir in &SUB_DIRS {
        fs::create_dir_all(root.join(subdir))
            .map_err(|e| format!("创建子目录 {} 失败: {}", subdir, e))?;
    }

    Ok(data_dir)
}

/// 安全检查：验证URL是否允许访问
/// 防止SSRF攻击：禁止访问内网、本地、私有地址
fn validate_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("无效的URL: {}", e))?;
    let host = parsed.host().ok_or("URL缺少主机名")?;
    
    // 检查主机名
    match host {
        url::Host::Domain(d) => {
            let domain = d.to_lowercase();
            // 禁止localhost和本地域名
            if domain == "localhost" || domain == "localhost.localdomain" {
                return Err("禁止访问本地地址".to_string());
            }
            // 禁止内网域名
            if domain.ends_with(".internal") || domain.ends_with(".local") {
                return Err("禁止访问内网地址".to_string());
            }
        }
        url::Host::Ipv4(ip) => {
            // 禁止私有IP地址段
            if ip.is_private() 
                || ip.is_loopback() 
                || ip.is_link_local()
                || ip == std::net::Ipv4Addr::new(169, 254, 0, 0) // 链路本地
                || ip == std::net::Ipv4Addr::new(224, 0, 0, 0) // 组播
                || ip == std::net::Ipv4Addr::new(127, 0, 0, 1) // 回环
            {
                return Err(format!("禁止访问内网地址: {}", ip));
            }
        }
        url::Host::Ipv6(ip) => {
            // 禁止IPv6私有/回环/链路本地地址
            if ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local() {
                return Err(format!("禁止访问IPv6内网地址: {}", ip));
            }
        }
    }
    
    // 禁止file://协议
    if parsed.scheme() == "file" {
        return Err("禁止访问本地文件".to_string());
    }
    
    // 只允许http/https
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!("不支持的协议: {}", parsed.scheme()));
    }
    
    Ok(())
}

/// 通过后端抓取网页HTML（绕过浏览器CORS限制）
/// 安全：已添加SSRF防护
#[tauri::command]
fn fetch_url(url: String) -> Result<String, String> {
    validate_url(&url)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("构建客户端失败: {}", e))?;

    let resp = client.get(&url).send()
        .map_err(|e| format!("请求失败: {}", e))?;

    let html = resp.text()
        .map_err(|e| format!("读取响应失败: {}", e))?;

    Ok(html)
}

/// 下载图片并保存到本地 assets 目录，返回本地文件路径
#[tauri::command]
fn download_image(url: String, filename: String) -> Result<String, String> {
    // 安全：SSRF防护，验证URL
    validate_url(&url)?;
    let data_dir = get_data_dir();
    let assets_dir = PathBuf::from(&data_dir).join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("构建客户端失败: {}", e))?;

    let bytes = client.get(&url).send()
        .map_err(|e| format!("下载失败: {}", e))?
        .bytes()
        .map_err(|e| format!("读取失败: {}", e))?;

    let filepath = assets_dir.join(&filename);
    // 安全：路径穿越防护，验证文件路径在assets目录内
    let assets_canonical = assets_dir.canonicalize().map_err(|e| format!("assets目录无效: {}", e))?;
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建子目录失败: {}", e))?;
        let parent_canonical = parent.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
        if !parent_canonical.starts_with(&assets_canonical) {
            return Err("非法路径：不允许访问assets目录之外的文件".to_string());
        }
    }
    let mut file = fs::File::create(&filepath).map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// 读取数据目录下的JSON文件，返回内容字符串。文件不存在时返回空数组
/// 安全：验证路径在数据目录内，防止路径穿越
#[tauri::command]
fn read_json_file(filename: String) -> Result<String, String> {
    let data_dir = get_data_dir();
    let filepath = PathBuf::from(&data_dir).join(&filename);
    // 文件不存在时返回空数组（先检查exists，避免canonicalize在文件不存在时失败）
    if !filepath.exists() {
        return Ok("[]".to_string());
    }
    // 安全检查：规范化路径并确保在数据目录内
    let canonical = filepath.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
    let data_canonical = PathBuf::from(&data_dir).canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    if !canonical.starts_with(&data_canonical) {
        return Err("非法路径：不允许访问数据目录之外的文件".to_string());
    }
    fs::read_to_string(&canonical).map_err(|e| format!("读取文件失败: {}", e))
}

/// LLM API 转发：通过后端发送Chat Completions请求，绕过浏览器CORS限制
#[tauri::command]
fn llm_chat(endpoint: String, api_key: String, body: String) -> Result<String, String> {
    // 安全：SSRF防护，验证endpoint URL
    validate_url(&endpoint)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("构建客户端失败: {}", e))?;

    let resp = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .body(body)
        .send()
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = resp.status();
    let text = resp.text().map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        // 安全：按字符截断而非字节，避免切断多字节UTF-8字符导致panic
        let truncated: String = text.chars().take(500).collect();
        return Err(format!("HTTP {}: {}", status.as_u16(), truncated));
    }

    Ok(text)
}

/// 写入JSON内容到数据目录下的文件
/// 安全：验证路径在数据目录内，防止路径穿越
#[tauri::command]
fn write_json_file(filename: String, content: String) -> Result<(), String> {
    let data_dir = get_data_dir();
    let root = PathBuf::from(&data_dir);
    fs::create_dir_all(&root).map_err(|e| format!("创建目录失败: {}", e))?;
    let filepath = root.join(&filename);
    // 安全检查：规范化路径并确保在数据目录内
    let data_canonical = root.canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    // 对于不存在的文件，检查父目录是否在数据目录内
    let parent = filepath.parent().ok_or("无效的文件路径")?;
    let parent_canonical = if parent.exists() {
        parent.canonicalize().map_err(|e| format!("路径无效: {}", e))?
    } else {
        // 父目录不存在，检查所有祖先路径
        let mut p = parent.to_path_buf();
        while !p.exists() {
            p = p.parent().ok_or("路径无效")?.to_path_buf();
        }
        p.canonicalize().map_err(|e| format!("路径无效: {}", e))?
    };
    if !parent_canonical.starts_with(&data_canonical) {
        return Err("非法路径：不允许访问数据目录之外的文件".to_string());
    }
    // 创建父目录
    fs::create_dir_all(parent).map_err(|e| format!("创建子目录失败: {}", e))?;
    // 额外检查：文件名不能包含路径分隔符
    if filename.contains('/') || filename.contains('\\') {
        return Err("非法文件名：不允许使用路径分隔符".to_string());
    }
    fs::write(&filepath, content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 写入二进制文件到数据目录下（用于导出 .pptx 等二进制文件）
/// filename: 相对路径（如 "ppt/xxx.pptx"）
/// base64_data: base64 编码的二进制数据（前端字段名为 base64Data，Tauri 自动 snake_case<->camelCase 转换）
#[tauri::command]
fn write_binary_file(filename: String, base64_data: String) -> Result<String, String> {
    let data_dir = get_data_dir();
    let root = PathBuf::from(&data_dir);
    fs::create_dir_all(&root).map_err(|e| format!("创建目录失败: {}", e))?;
    let filepath = root.join(&filename);
    // 安全：路径穿越防护，验证路径在数据目录内
    let data_canonical = root.canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    // 创建文件的父目录（如 ppt/）
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建子目录失败: {}", e))?;
        let parent_canonical = parent.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
        if !parent_canonical.starts_with(&data_canonical) {
            return Err("非法路径：不允许访问数据目录之外的文件".to_string());
        }
    }
    // 解码 base64
    let bytes = general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|e| format!("base64 解码失败: {}", e))?;
    // 写入二进制
    let mut file = fs::File::create(&filepath).map_err(|e| format!("创建文件失败: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(filepath.to_string_lossy().to_string())
}

/// Base64 编码（统一使用 base64 crate，避免手写实现的维护负担）
fn base64_encode(bytes: &[u8]) -> String {
    general_purpose::STANDARD.encode(bytes)
}

/// 通过后端代理获取图片，返回 base64 data URI，绕过防盗链
#[tauri::command]
fn fetch_image_base64(url: String) -> Result<String, String> {
    // 安全：SSRF防护，验证URL
    validate_url(&url)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("构建客户端失败: {}", e))?;

    let resp = client
        .get(&url)
        .header("Referer", "https://mp.weixin.qq.com/")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .map_err(|e| format!("请求失败: {}", e))?;

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = resp.bytes().map_err(|e| format!("读取图片失败: {}", e))?;
    let b64 = base64_encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, b64))
}

/// 列出数据目录下指定子目录中的文件列表
/// 返回文件名、完整路径、修改时间（毫秒）、文件大小（字节）
#[tauri::command]
fn list_files(subdir: String) -> Result<Vec<FileInfo>, String> {
    let data_dir = get_data_dir();
    let dir_path = PathBuf::from(&data_dir).join(&subdir);
    if !dir_path.exists() {
        return Ok(Vec::new());
    }
    // 安全：路径穿越防护，验证目录在数据目录内
    let data_canonical = PathBuf::from(&data_dir).canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    let dir_canonical = dir_path.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
    if !dir_canonical.starts_with(&data_canonical) {
        return Err("非法路径：不允许访问数据目录之外的文件".to_string());
    }
    let mut files = Vec::new();
    let entries = fs::read_dir(&dir_canonical).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let is_dir = path.is_dir();
        // 同时列出文件和文件夹（文件夹 size=0，前端用 is_dir 区分图标）
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let full_path = path.to_string_lossy().to_string();
        let modified = entry.metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let size = if is_dir { 0 } else { entry.metadata().map(|m| m.len()).unwrap_or(0) };
        files.push(FileInfo { name, path: full_path, modified, size, is_dir });
    }
    // 按修改时间降序排列（最新的在前）
    files.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(files)
}

/// 文件信息（用于前端展示文件列表）
#[derive(serde::Serialize)]
struct FileInfo {
    name: String,
    path: String,
    modified: u64,
    size: u64,
    is_dir: bool,
}

/// 删除数据目录下的文件
/// 安全：验证路径在数据目录内，防止路径穿越
#[tauri::command]
fn delete_data_file(filepath: String) -> Result<(), String> {
    let data_dir = get_data_dir();
    let path = PathBuf::from(&data_dir).join(&filepath);
    // 安全检查：规范化路径并确保在数据目录内
    let canonical = path.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
    let data_canonical = PathBuf::from(&data_dir).canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    if !canonical.starts_with(&data_canonical) {
        return Err("非法路径：不允许访问数据目录之外的文件".to_string());
    }
    if !canonical.exists() {
        return Err(format!("文件不存在: {}", filepath));
    }
    fs::remove_file(&canonical).map_err(|e| format!("删除文件失败: {}", e))
}

/// 用系统默认程序打开文件（Word/PPT/Excel/PDF等）
#[tauri::command]
fn open_file(file_path: String) -> Result<(), String> {
    // 去除Windows长路径前缀 \\?\ 和末尾反斜杠（canonicalize()会产生这个前缀）
    let clean_path = file_path
        .strip_prefix(r"\\?\")
        .unwrap_or(&file_path)
        .trim_end_matches('\\')
        .to_string();
    // 检查文件是否存在
    if !std::path::Path::new(&clean_path).exists() {
        return Err(format!("文件不存在: {}", clean_path));
    }
    #[cfg(target_os = "windows")]
    {
        // 安全：命令注入防护，验证路径不含cmd元字符 " 和 %，用引号包裹防止特殊字符被cmd解释
        if clean_path.contains('"') || clean_path.contains('%') {
            return Err("文件路径包含非法字符，拒绝执行".to_string());
        }
        let quoted = format!("\"{}\"", clean_path);
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &quoted])
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| format!("打开文件失败: {}", e))?;
    }
    Ok(())
}

/// 读取文本文件内容（用于知识库区右侧面板内嵌预览）
/// 限制文件大小为10MB，防止内存爆炸；仅支持UTF-8文本文件
#[tauri::command]
fn readfilecontent(file_path: String) -> Result<String, String> {
    // 去除Windows长路径前缀
    let clean_path = file_path
        .strip_prefix(r"\\?\")
        .unwrap_or(&file_path)
        .trim_end_matches('\\')
        .to_string();
    let path = std::path::Path::new(&clean_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    // 限制文件大小：10MB
    let metadata = std::fs::metadata(path).map_err(|e| format!("读取文件信息失败: {}", e))?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("文件过大（超过10MB），不支持内嵌预览".to_string());
    }
    // 安全：验证路径在数据目录内
    let data_dir = get_data_dir();
    let data_canonical = PathBuf::from(&data_dir).canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    let path_canonical = path.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
    if !path_canonical.starts_with(&data_canonical) {
        return Err("非法路径：只允许访问数据目录内的文件".to_string());
    }
    std::fs::read_to_string(&path_canonical).map_err(|e| format!("读取文件失败: {}", e))
}

/// 生成 AMiner 开放平台 JWT
/// API Key 仅在 Rust 后端使用，不暴露到前端
/// Header: {"alg":"HS256","sign_type":"SIGN"}
/// Payload: {"user_id":"llm-wiki","exp":now+7200,"timestamp":now}
fn generate_aminer_jwt() -> Result<String, String> {
    // 安全：API Key优先从环境变量读取，fallback到默认值保证功能不破坏
    let api_key = std::env::var("AMINER_API_KEY").unwrap_or_else(|_| "wGCjMo8W+ZUiwg==".to_string());
    let header = serde_json::json!({
        "alg": "HS256",
        "sign_type": "SIGN"
    });
    let now = chrono::Utc::now().timestamp();
    let payload = serde_json::json!({
        "user_id": "llm-wiki",
        "exp": now + 7200,
        "timestamp": now
    });

    let header_str = serde_json::to_string(&header).map_err(|e| format!("序列化header失败: {}", e))?;
    let payload_str = serde_json::to_string(&payload).map_err(|e| format!("序列化payload失败: {}", e))?;

    let header_b64 = general_purpose::URL_SAFE_NO_PAD.encode(header_str.as_bytes());
    let payload_b64 = general_purpose::URL_SAFE_NO_PAD.encode(payload_str.as_bytes());
    let signing_input = format!("{}.{}", header_b64, payload_b64);

    let mut mac = Hmac::<Sha256>::new_from_slice(api_key.as_bytes())
        .map_err(|e| format!("HMAC初始化失败: {}", e))?;
    mac.update(signing_input.as_bytes());
    let signature = general_purpose::URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

    Ok(format!("{}.{}", signing_input, signature))
}

/// AMiner 开放平台请求转发
/// method: HTTP 方法（GET/POST）
/// endpoint: 接口路径（如 /api/v3/...）
/// query_params: 可选查询字符串（不含 ?）
/// body: 可选请求体（JSON 字符串）
#[tauri::command]
fn aminer_request(method: String, endpoint: String, query_params: Option<String>, body: Option<String>) -> Result<String, String> {
    let jwt = generate_aminer_jwt()?;
    let base_url = "https://datacenter.aminer.cn/gateway/open_platform";

    // 构造完整URL
    let mut url = format!("{}{}", base_url, endpoint);
    if let Some(qp) = query_params {
        if !qp.is_empty() {
            url = format!("{}?{}", url, qp);
        }
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("构建客户端失败: {}", e))?;

    let mut request = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        _ => return Err(format!("不支持的HTTP方法: {}", method)),
    };

    request = request
        .header("Authorization", &jwt)
        .header("X-Platform", "openclaw")
        .header("Content-Type", "application/json;charset=utf-8");

    if let Some(b) = body {
        if !b.is_empty() {
            request = request.body(b);
        }
    }

    let resp = request.send().map_err(|e| format!("请求失败: {}", e))?;
    let text = resp.text().map_err(|e| format!("读取响应失败: {}", e))?;

    Ok(text)
}

/// AMiner PDF 上传（用于 pdf-citation-verifier 引文校验）
/// pdf_path: 本地 PDF 文件路径
#[tauri::command]
fn aminer_upload_pdf(pdf_path: String) -> Result<String, String> {
    // 安全：路径穿越防护，验证pdf_path在数据目录内，防止任意文件读取
    let data_dir = get_data_dir();
    let data_canonical = PathBuf::from(&data_dir).canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    let pdf_canonical = PathBuf::from(&pdf_path).canonicalize().map_err(|e| format!("路径无效: {}", e))?;
    if !pdf_canonical.starts_with(&data_canonical) {
        return Err("非法路径：只允许访问数据目录内的文件".to_string());
    }
    let jwt = generate_aminer_jwt()?;
    let base_url = "https://datacenter.aminer.cn/gateway/open_platform";
    let url = format!("{}/api/v3/paper/citation/verify/upload", base_url);

    // 读取PDF文件
    let file_bytes = std::fs::read(&pdf_canonical).map_err(|e| format!("读取PDF失败: {}", e))?;

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("构建客户端失败: {}", e))?;

    // 用multipart上传
    let part = reqwest::blocking::multipart::Part::bytes(file_bytes)
        .file_name("paper.pdf")
        .mime_str("application/pdf")
        .map_err(|e| format!("创建multipart部分失败: {}", e))?;
    let form = reqwest::blocking::multipart::Form::new().part("file", part);

    let resp = client.post(&url)
        .header("Authorization", &jwt)
        .header("X-Platform", "openclaw")
        .multipart(form)
        .send()
        .map_err(|e| format!("上传失败: {}", e))?;

    let text = resp.text().map_err(|e| format!("读取响应失败: {}", e))?;
    Ok(text)
}

/// 复制文件或文件夹到知识库材料目录的核心逻辑（非command，可供on_webview_event回调直接调用）
/// 支持文件夹递归复制；允许从数据目录外导入（仅拒绝系统目录）
fn copy_to_knowledge_materials(source_path: &str) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    let source_canonical = source.canonicalize().map_err(|e| format!("源路径无效: {}", e))?;

    // 安全：拒绝从系统目录复制，防止误操作系统文件
    let dangerous_dirs = [
        PathBuf::from("C:\\Windows"),
        PathBuf::from("C:\\Program Files"),
        PathBuf::from("C:\\Program Files (x86)"),
    ];
    for d in &dangerous_dirs {
        if source_canonical.starts_with(d) {
            return Err("安全限制：不允许从系统目录复制".to_string());
        }
    }

    let data_dir = get_data_dir();
    let knowledge_dir = PathBuf::from(&data_dir).join("knowledge-materials");
    std::fs::create_dir_all(&knowledge_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    let filename = source.file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?
        .to_string_lossy()
        .to_string();
    let dest = knowledge_dir.join(&filename);

    // 如果目标已存在，加时间戳避免覆盖
    let dest = if dest.exists() {
        let stem = source.file_stem().unwrap_or_default().to_string_lossy();
        let ext = source.extension().unwrap_or_default().to_string_lossy();
        let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
        if ext.is_empty() {
            knowledge_dir.join(format!("{}_{}", stem, ts))
        } else {
            knowledge_dir.join(format!("{}_{}.{}", stem, ts, ext))
        }
    } else {
        dest
    };

    if source_canonical.is_dir() {
        // 递归复制文件夹
        copy_dir_recursive(&source_canonical, &dest)
            .map_err(|e| format!("复制文件夹失败: {}", e))?;
    } else {
        std::fs::copy(&source_canonical, &dest).map_err(|e| format!("复制文件失败: {}", e))?;
    }
    Ok(dest.to_string_lossy().to_string())
}

/// 复制文件或文件夹到知识库材料目录（Tauri command，前端可通过invoke调用）
#[tauri::command]
fn copy_file_to_knowledge(source_path: String) -> Result<String, String> {
    copy_to_knowledge_materials(&source_path)
}

/// 递归复制目录（私有辅助函数）
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
    let entries = std::fs::read_dir(src).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}

/// 删除数据目录下的文件或文件夹
/// 安全：验证路径在数据目录内，防止路径穿越
#[tauri::command]
fn delete_file(filepath: String) -> Result<(), String> {
    let data_dir = get_data_dir();
    let root = PathBuf::from(&data_dir);
    let path = root.join(&filepath);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    // 安全：路径穿越防护，规范化路径并确保在数据目录内
    let data_canonical = root.canonicalize().map_err(|e| format!("数据目录无效: {}", e))?;
    let path_canonical = path.canonicalize().map_err(|e| format!("路径无效: {}", e))?;
    if !path_canonical.starts_with(&data_canonical) {
        return Err("非法路径：不允许访问数据目录之外的文件".to_string());
    }
    if path_canonical.is_dir() {
        std::fs::remove_dir_all(&path_canonical).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        std::fs::remove_file(&path_canonical).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

/// 获取数据目录下指定子目录的大小（字节）
#[tauri::command]
fn get_dir_size(subdir: String) -> Result<u64, String> {
    let data_dir = get_data_dir();
    let dir_path = PathBuf::from(&data_dir).join(&subdir);
    if !dir_path.exists() {
        return Ok(0);
    }
    fn dir_size(path: &std::path::Path) -> u64 {
        let mut size = 0;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    size += dir_size(&p);
                } else if let Ok(meta) = entry.metadata() {
                    size += meta.len();
                }
            }
        }
        size
    }
    Ok(dir_size(&dir_path))
}

/// 简易 percent-decoding：将 %XX 序列还原为字节，支持中文等多字节 UTF-8 字符
fn percent_decode_str(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// 启动内置HTTP服务器，提供前端静态文件
/// 在主线程中绑定监听器，确保返回时服务器已准备好接受连接
fn start_embedded_server() {
    use std::net::TcpListener;
    let listener = match TcpListener::bind("127.0.0.1:18080") {
        Ok(l) => l,
        Err(e) => {
            eprintln!("绑定HTTP服务器失败: {}", e);
            return;
        }
    };
    eprintln!("内置HTTP服务器已启动: http://127.0.0.1:18080");
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                std::thread::spawn(move || {
                    let mut buffer = [0u8; 4096];
                    if stream.read(&mut buffer).is_err() { return; }
                    let request = String::from_utf8_lossy(&buffer);
                    let raw_path = request.lines().next()
                        .and_then(|l| l.split_whitespace().nth(1))
                        .unwrap_or("/");
                    // 去掉查询参数（?v=xxx），只保留路径部分
                    let path = raw_path.split('?').next().unwrap_or("/");
                    // 安全：路径穿越防护，拒绝含 .. 的路径
                    if path.contains("..") {
                        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n400 Bad Request");
                        return;
                    }
                    // 处理数据目录文件路由 /data-file/xxx — 让前端能通过HTTP访问数据目录的文件
                    if path.starts_with("/data-file/") {
                        let rel_path = percent_decode_str(path.trim_start_matches("/data-file/"));
                        let data_dir = get_data_dir();
                        let data_file_path = PathBuf::from(&data_dir).join(rel_path);
                        if !data_file_path.exists() {
                            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n404 Not Found");
                            return;
                        }
                        if let Ok(content) = std::fs::read(&data_file_path) {
                            let fp = data_file_path.to_string_lossy();
                            let ct = if fp.ends_with(".pdf") { "application/pdf" }
                                else if fp.ends_with(".png") { "image/png" }
                                else if fp.ends_with(".jpg") || fp.ends_with(".jpeg") { "image/jpeg" }
                                else if fp.ends_with(".svg") { "image/svg+xml" }
                                else if fp.ends_with(".gif") { "image/gif" }
                                else if fp.ends_with(".pptx") { "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
                                else if fp.ends_with(".docx") { "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
                                else if fp.ends_with(".xlsx") { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
                                else if fp.ends_with(".md") { "text/markdown; charset=utf-8" }
                                else if fp.ends_with(".txt") { "text/plain; charset=utf-8" }
                                else if fp.ends_with(".json") { "application/json; charset=utf-8" }
                                else if fp.ends_with(".csv") { "text/csv; charset=utf-8" }
                                else if fp.ends_with(".log") || fp.ends_with(".xml") { "text/plain; charset=utf-8" }
                                else { "application/octet-stream" };
                            let header = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\n\r\n",
                                ct, content.len()
                            );
                            let _ = stream.write_all(header.as_bytes());
                            let _ = stream.write_all(&content);
                        } else {
                            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n404 Not Found");
                        }
                        return;
                    }
                    let dist_root = PathBuf::from("D:/llm-wiki-dist");
                    let rel = if path == "/" { "index.html" } else { path.trim_start_matches('/') };
                    let file_path_buf = dist_root.join(rel);
                    // 规范化并验证在根目录内，防止路径穿越
                    let file_path = match (dist_root.canonicalize(), file_path_buf.canonicalize()) {
                        (Ok(r), Ok(f)) if f.starts_with(&r) => f.to_string_lossy().to_string(),
                        _ => {
                            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n404");
                            return;
                        }
                    };
                    let ct = if file_path.ends_with(".js") { "application/javascript; charset=utf-8" }
                        else if file_path.ends_with(".css") { "text/css; charset=utf-8" }
                        else if file_path.ends_with(".html") { "text/html; charset=utf-8" }
                        else if file_path.ends_with(".json") { "application/json; charset=utf-8" }
                        else if file_path.ends_with(".png") { "image/png" }
                        else if file_path.ends_with(".jpg") || file_path.ends_with(".jpeg") { "image/jpeg" }
                        else if file_path.ends_with(".svg") { "image/svg+xml" }
                        else if file_path.ends_with(".woff2") { "font/woff2" }
                        else { "application/octet-stream" };
                    if let Ok(content) = std::fs::read(&file_path) {
                        let header = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache, no-store, must-revalidate\r\n\r\n",
                            ct, content.len()
                        );
                        let _ = stream.write_all(header.as_bytes());
                        let _ = stream.write_all(&content);
                    } else {
                        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n404");
                    }
                });
            }
        }
    });
}

/// Tauri 应用入口
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动内置HTTP服务器提供前端文件
    start_embedded_server();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            ensure_data_dir,
            fetch_url,
            download_image,
            read_json_file,
            write_json_file,
            write_binary_file,
            llm_chat,
            fetch_image_base64,
            open_file,
            readfilecontent,
            list_files,
            delete_data_file,
            // AMiner 开放平台命令
            aminer_request,
            aminer_upload_pdf,
            copy_file_to_knowledge,
            delete_file,
            get_dir_size,
            // WPS 集成命令
            wps_integration::wps_is_installed,
            wps_integration::wps_start,
            wps_integration::wps_quit,
            wps_integration::wps_open_document,
            wps_integration::wps_create_document,
            wps_integration::wps_close_document,
            wps_integration::wps_save_document,
            wps_integration::wps_save_as,
            wps_integration::wps_export_document,
            wps_integration::wps_read_document,
            wps_integration::wps_edit_content,
            wps_integration::wps_execute_macro,
        ])

        .on_window_event(|window, event| match event {
            tauri::WindowEvent::DragDrop(drag_event) => {
                if let tauri::DragDropEvent::Drop { paths, .. } = drag_event {
                    eprintln!("检测到文件拖放，共 {} 个文件", paths.len());
                    for path in paths {
                        let path_str = path.to_string_lossy().to_string();
                        match copy_to_knowledge_materials(&path_str) {
                            Ok(dest) => {
                                eprintln!("拖拽文件已复制: {} -> {}", path_str, dest);
                            }
                            Err(e) => {
                                eprintln!("拖拽文件复制失败: {} - {}", path_str, e);
                            }
                        }
                    }
                    // 通知前端刷新文件列表
                    let _ = window.emit("knowledge-updated", ());
                }
            }
            _ => {}
        })

        .setup(|app| {
            // Tauri 2.x在Windows上自定义协议无法加载前端文件（about:blank问题）
            // 解决方案：用WebviewWindowBuilder直接创建窗口连接内置HTTP服务器
            // 添加时间戳参数强制WebView2不使用缓存
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let url = format!("http://127.0.0.1:18080/index.html?v={}", ts);
            let url_parsed = url.parse().map_err(|e| format!("URL解析失败: {}", e))?;
            let webview_window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(url_parsed),
            )
            .title("LLM Wiki - 知识管理系统")
            .inner_size(1200.0, 800.0)
            .resizable(true)

            .build()?;
            eprintln!("已创建主窗口连接 {}, label={:?}", url, webview_window.label());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
