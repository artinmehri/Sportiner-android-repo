export interface SignupInterface {
    onNext: () => void;
    onBack: () => void;
    changeData: (value: any | ((prev: any) => any)) => void;     
}