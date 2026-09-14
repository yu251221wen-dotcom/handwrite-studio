# 本地解析服务

在项目根目录安装依赖并启动：

```powershell
python -m pip install -r server/requirements.txt
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```

服务只监听本机地址。`/api/documents/parse` 接收不超过 20 MB 的 DOCX，返回统一 DocumentBlock 文档结构，不保存上传文件。V3.1 不再在正式导入路径执行旧字段映射；响应中的 `fields` 仅为兼容旧客户端而保留为空数组。
