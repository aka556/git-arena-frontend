/**
 * 认证契约类型（对应后端 AuthDtos.UserView / AuthResponse）。
 */
export interface UserView {
  id: number
  username: string | null
  displayName: string | null
  email: string | null
  guest: boolean
  totalPoints: number
  avatarColor: string | null
}

export interface AuthResponse {
  token: string
  user: UserView
}

/** 注册入参：邮箱与验证码为必填（后端已改为 @NotBlank）。 */
export interface RegisterPayload {
  username: string
  password: string
  email: string
  code: string
}