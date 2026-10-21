declare module 'react-native-razorpay' {
  export interface RazorpayOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    prefill?: { email?: string; name?: string; contact?: string };
    theme?: { color?: string };
  }

  export interface RazorpaySuccess {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  export interface RazorpayError {
    code: number;
    description: string;
  }

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccess>;
  };
  export default RazorpayCheckout;
}
