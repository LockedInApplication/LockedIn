import BaseToast from "./BaseToast";

type ErrorToastProps = {
  message: string;
  className?: string;
  visible?: boolean;
  onDismiss?: () => void;
};

export default function ErrorToast({
  message,
  className,
  visible = false,
  onDismiss,
}: ErrorToastProps) {
  return (
    <BaseToast
      message={message}
      type="error"
      className={className}
      visible={visible}
      onDismiss={onDismiss}
    />
  );
}
