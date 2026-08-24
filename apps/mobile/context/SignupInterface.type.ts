export interface SignupInterface {
    onNext: (value?: string | Record<string, unknown>) => void | Promise<void>;
    onBack: () => void;
    changeData: (value: any | ((prev: any) => any)) => void;
    method?: string;
    providerName?: string;
    data?: any;
}

export interface ForgotPasswordFormState {
    email: string;
}

export interface ResetPasswordFormState {
    password: string;
    confirmPassword: string;
}
