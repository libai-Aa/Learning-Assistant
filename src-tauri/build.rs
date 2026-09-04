fn main() {
    // Tauri 2.x ACL: permissions/app-commands.toml 定义了 allow-all-commands 权限，
    // tauri_build::build() 会自动读取 permissions/ 目录并合并到 ACL manifest 中。
    tauri_build::build();
}
