fn main() {
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=assets/app.ico");
    // 图标资源可选：没有 rc.exe 时只是 exe 不带图标，不让构建失败
    let _ = embed_resource::compile("app.rc", embed_resource::NONE).manifest_optional();
}
