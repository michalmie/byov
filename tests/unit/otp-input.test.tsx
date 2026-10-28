import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, vi } from "vitest";
import { OtpInput } from "@/components/otp-input";

function Harness({
  onComplete,
  status,
  resendIn,
  onResend,
}: {
  onComplete?: (code: string) => void;
  status?: "idle" | "verifying" | "error";
  resendIn?: number;
  onResend?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <OtpInput
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      status={status}
      inputTestId="otp-code"
      resendTestId="otp-resend"
      onResend={onResend}
      resendIn={resendIn}
    />
  );
}

function boxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".otp-box"));
}

describe("OtpInput", () => {
  it("renders six boxes over one accessible code input", () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
    const input = screen.getByTestId("otp-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAccessibleName("Verification code, 6 digits");
  });

  it("draws typed digits into the boxes", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("otp-code"), {
      target: { value: "482" },
    });
    const text = boxes().map((box) => box.textContent);
    expect(text).toEqual(["4", "8", "2", "", "", ""]);
    expect(boxes().filter((box) => box.hasAttribute("data-filled"))).toHaveLength(3);
  });

  it("keeps digits only and caps the length", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("otp-code"), {
      target: { value: "48a2 913xyz" },
    });
    expect(boxes().map((box) => box.textContent).join("")).toBe("482913");
  });

  it("fires onComplete once the last box fills", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input = screen.getByTestId("otp-code");
    fireEvent.change(input, { target: { value: "12345" } });
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "123456" } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("marks the field invalid while the status is error", () => {
    const { rerender } = render(<Harness status="idle" />);
    expect(screen.getByTestId("otp-code")).not.toHaveAttribute("aria-invalid");
    rerender(<Harness status="error" />);
    expect(screen.getByTestId("otp-code")).toHaveAttribute("aria-invalid", "true");
    expect(document.querySelector(".otp")?.getAttribute("data-error")).toBe("true");
  });

  it("shows a countdown while resend waits and a button when ready", () => {
    const onResend = vi.fn();
    const { rerender } = render(
      <Harness onResend={onResend} resendIn={30} />,
    );
    expect(screen.getByText("Resend in 0:30")).toBeInTheDocument();
    expect(screen.queryByTestId("otp-resend")).not.toBeInTheDocument();

    rerender(<Harness onResend={onResend} resendIn={0} />);
    const button = screen.getByTestId("otp-resend");
    expect(button).toHaveTextContent("Resend code");
    fireEvent.click(button);
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("renders no resend row without onResend", () => {
    render(<Harness />);
    expect(screen.queryByText(/get a code\?/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resend/)).not.toBeInTheDocument();
  });
});
