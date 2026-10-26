"use client";

export function ConfirmButton({ message, ...props }: { message: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
