export interface SignupInterface {
    onNext: (selectedGameId?: string) => void | Promise<void>;
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
