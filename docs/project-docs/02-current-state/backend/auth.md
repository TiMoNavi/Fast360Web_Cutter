# 用户注册登录模块当前状态

## 已实现

当前接口：

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

当前能力：

```text
email trim + lowercase。
密码长度至少 6。
PBKDF2-HMAC-SHA256 + 随机 salt。
登录成功写入 auth_sessions。
设置 tid_session HTTP-only cookie。
require_user 保护视频、session 和 export 接口。
支持登出删除 session 并清 cookie。
```

当前表：

```text
users
auth_sessions
```

## 当前代码位置

```text
apps/api/app/main.py
认证路由、密码 hash、session 创建、require_user。

apps/api/app/storage.py
users / auth_sessions 表初始化。

apps/api/app/models.py
AuthRequest / AuthUser。
```

## 当前缺口

```text
认证代码还没有从 main.py 拆出。
没有邮箱验证。
没有密码重置。
没有角色权限。
生产级 cookie、安全策略和 session 管理还需要增强。
```
