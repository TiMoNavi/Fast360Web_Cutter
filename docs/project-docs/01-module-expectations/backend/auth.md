# 用户注册登录模块预期

## 职责

用户注册登录模块只负责用户身份和登录态，不关心视频、WebXR 路径或裁切细节。

它负责：

```text
注册。
登录。
登出。
获取当前用户。
密码存储。
session cookie。
session 过期清理。
基础权限身份注入。
```

## 输入

```text
email
password
tid_session cookie
```

## 输出

```text
AuthUser
auth_sessions 记录
当前请求 user_id
清除 cookie 的登出响应
```

## 不应承担的职责

认证模块不应该：

```text
读取视频列表。
创建 cut session。
保存 ViewPathPatch。
判断 export 是否可下载。
调用渲染器。
```

## 预期代码边界

```text
routes/auth.py
HTTP 路由。

services/auth_service.py
注册、登录、登出、session 验证。

repositories/user_repository.py
users / auth_sessions 数据读写。
```

其他模块只通过 `require_user` 或等价的身份依赖拿到当前用户，不直接操作认证内部表。
