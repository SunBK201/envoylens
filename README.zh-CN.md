# EnvoyLens

[English](README.md) | 简体中文

EnvoyLens 是一个 Envoy 配置可视化工具，用于阅读 bootstrap 配置和 Admin config dump，查看资源细节及其依赖关系。

支持 JSON / YAML，可从 Admin 地址读取、粘贴文本或上传文件。提供关系图、分组资源列表和完整配置视图，可将多份配置保存在浏览器中快速切换。

## 主要功能

- **关系图**：展示 Listener、Listener filter、Filter chain、Match、Network filter、HTTP filter、Route、Cluster 和 Endpoint 之间的关系。
- **资源导航**：按 Listener、Filter chain、Cluster、Endpoint 分组，支持折叠、数量统计、名称正反向排序及宽度调整。
- **配置详情**：提供带行号、高亮和折叠的 JSON 视图，以及按 Envoy 配置含义组织的语义视图；记住最后选择的展示方式。
- **配置来源**：以 `Bootstrap`、`xDS` 标识可确认的资源来源，不混用运行状态或 Cluster discovery type；无法确定来源时不显示标签。
- **多配置管理**：保存、切换、重命名、编辑和删除配置；支持下载当前配置。
- **交互**：鼠标拖动画布、触控板缩放、全图概览、搜索、节点悬浮预览、链路高亮和可调整大小的详情面板。
- **外观与恢复**：支持浅色、暗黑和跟随系统，恢复已保存配置及部分导航、筛选和视图偏好。
- **参考文档**：节点详情和悬浮预览提供 Envoy 1.20 参考链接；未知扩展可能使用通用文档入口。

## 快速开始

### Go 单文件运行

构建环境需要 **Node.js 22.12+**、npm 和 **Go 1.22+**：

```sh
npm ci
npm run build:go
./bin/envoylens
```

生成的 `bin/envoylens` 内嵌前端页面和 Admin 代理，可以单独复制到相同操作系统及架构的机器运行，**不需要 Node.js、npm 或外部 dist 目录**。

默认监听 **`0.0.0.0:4173`**。本机打开 [EnvoyLens](http://127.0.0.1:4173)，其他设备通过运行主机的 IP 和端口访问。

### 监听地址

使用 `-addr` 指定完整的 `host:port`：

```sh
# 仅允许本机连接
./bin/envoylens -addr 127.0.0.1:4173

# 自定义监听端口
./bin/envoylens -addr 0.0.0.0:8080

# IPv6 本机地址
./bin/envoylens -addr '[::1]:4173'

# 查看参数
./bin/envoylens -h
```

也可设置 `PORT` 环境变量；显式 `-addr` 优先于 `PORT`。不提供 `-port` 参数。

通配监听时，Admin 代理允许使用 IP 地址或 localhost 访问。若通过域名访问，应将可解析到本机监听接口的域名写入 `-addr`，以匹配 API 的 Host 校验。

### Node.js 开发与运行

```sh
npm ci
npm run dev
```

开发服务支持前端热更新，默认访问 [本地页面](http://127.0.0.1:4173)。Node 服务固定监听 `127.0.0.1`，与 Go 程序的默认监听范围不同。

```sh
# 修改 Node 服务端口
PORT=4180 npm run dev

# 构建并使用 Node 托管静态页面
npm run build
npm start
```

## 构建与测试

```sh
# 前端与 Node 测试
npm test

# 前端静态构建，输出 dist/
npm run build

# Go 测试（先生成内嵌前端）
npm run test:go

# 单文件构建，输出 bin/envoylens
npm run build:go
```

Go 使用 `go:embed` 嵌入 `dist/`。全新检出后直接运行 `go build` 或 `go test` 前，必须先运行 `npm ci && npm run build`。前端变更后也必须重新打包，旧二进制不会自动更新页面。

### 跨平台构建

先构建前端，再选择目标系统和架构：

```sh
npm run build

CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-linux-amd64 .
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-linux-arm64 .
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-darwin-arm64 .
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o bin/envoylens-windows-amd64.exe .
```

### 自定义 Envoy 参考文档地址

点击界面右下角的书本图标（文档设置），填写指定版本的文档根地址或兼容的内网镜像。
也可直接粘贴以 `/index.html` 结尾的首页地址，保存时会自动转换为所在目录。
保存后，资源详情和节点预览的参考链接立即更新，设置保存在当前浏览器中。
留空或点击“恢复默认”后保存即可恢复 v1.20.0。仅支持 HTTP/HTTPS，不能包含认证信息、查询参数或片段。
资源的 API 路径与锚点仍沿用现有映射；切换版本或镜像不会自动验证目标页面是否存在。
