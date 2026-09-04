//! ACL 白名单验证：直接调用 Tauri 的 Resolved::resolve 复现运行时构建，
//! 检查 readfilecontent 是否在 allowed_commands 中及其上下文。
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::utils::acl::capability::Capability;
use tauri::utils::acl::manifest::Manifest;
use tauri::utils::acl::resolved::Resolved;
use tauri::utils::platform::Target;

fn check(out_dir: &PathBuf) {
    println!("=== 检查 {:?} ===", out_dir);
    let acl_raw = match std::fs::read_to_string(out_dir.join("acl-manifests.json")) {
        Ok(s) => s,
        Err(e) => { println!("  读取失败: {e}"); return; }
    };
    let cap_raw = match std::fs::read_to_string(out_dir.join("capabilities.json")) {
        Ok(s) => s,
        Err(e) => { println!("  读取失败: {e}"); return; }
    };
    let acl: BTreeMap<String, Manifest> = match serde_json::from_str(&acl_raw) {
        Ok(m) => m,
        Err(e) => { println!("  ACL 解析失败: {e}"); return; }
    };
    let caps: BTreeMap<String, Capability> = match serde_json::from_str(&cap_raw) {
        Ok(m) => m,
        Err(e) => { println!("  capabilities 解析失败: {e}"); return; }
    };

    let resolved = match Resolved::resolve(&acl, caps, Target::Windows) {
        Ok(r) => r,
        Err(e) => { println!("  resolve 失败: {e}"); return; }
    };

    println!("  has_app_acl: {}", resolved.has_app_acl);
    println!("  allowed_commands 总数: {}", resolved.allowed_commands.len());
    println!("  全部命令: {:?}", resolved.allowed_commands.keys().collect::<Vec<_>>());
    for name in ["readfilecontent", "read_file_content", "list_files", "open_file"] {
        match resolved.allowed_commands.get(name) {
            Some(cmds) => {
                println!("  [{name}] ✓ 存在, {} 条上下文:", cmds.len());
                for c in cmds { println!("      {:?}", c); }
            }
            None => println!("  [{name}] ✗ 不在白名单!"),
        }
    }
    println!();
}

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let target = manifest_dir.join("target");
    for profile in ["debug", "release"] {
        let build_dir = target.join(profile).join("build");
        if let Ok(entries) = std::fs::read_dir(&build_dir) {
            for e in entries.flatten() {
                let out = e.path().join("out");
                if out.join("acl-manifests.json").exists() {
                    check(&out);
                }
            }
        }
    }
}