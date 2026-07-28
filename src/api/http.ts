/**
 * Axios 封装（§6.2：组件不直接写 axios URL，一律走 api/ 层）。
 * 统一解包后端 Result<T>：code=0 取 data，否则抛出携带 message 的错误。
 */
import axios, { type AxiosInstance } from 'axios'

/** 后端统一响应包装 org.xiaoyu.gitarena.domain.Result<T>。 */
interface Result<T> {
  code: number
  message: string
  data: T
}

const instance: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

instance.interceptors.response.use(
  (response) => {
    const body = response.data as Result<unknown>
    if (body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  (error) => {
    const msg = error?.response?.data?.message ?? error?.message ?? '网络错误'
    return Promise.reject(new Error(msg))
  },
)

/** 发起请求并解包出 Result.data。 */
export async function request<T>(config: Parameters<AxiosInstance['request']>[0]): Promise<T> {
  const response = await instance.request<Result<T>>(config)
  return response.data.data
}

export default instance
