export type Role = 'owner' | 'admin' | 'accounts' | 'supervisor' | 'driver' | 'promoter' | 'customer'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: Role
  pay_type: 'daily' | 'monthly'
  day_rate: number
  monthly_salary: number
  active: boolean
}
