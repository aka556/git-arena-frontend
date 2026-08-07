/**
 * 认证接口（对应后端 AuthController，一个后端资源一个文件——§6.1）。
 */
import { request } from './http'
import type { AuthResponse, RegisterPayload, UserView } from '@/types/auth'

/** 发送邮箱验证码（注册的邮箱验证路径用）。 */
export function sendCode(email: string): Promise<void> {
  return request<void>({ url: '/auth/send-code', method: 'post', data: { email } })
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return request<AuthResponse>({ url: '/auth/register', method: 'post', data: payload })
}

export function login(usernameOrEmail: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>({ url: '/auth/login', method: 'post', data: { usernameOrEmail, password } })
}

export function guest(): Promise<AuthResponse> {
  return request<AuthResponse>({ url: '/auth/guest', method: 'post' })
}

export function logout(): Promise<void> {
  return request<void>({ url: '/auth/logout', method: 'post' })
}

export function fetchMe(): Promise<UserView> {
  return request<UserView>({ url: '/auth/me', method: 'get' })
}
