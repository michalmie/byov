import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, vi } from "vitest";
import { OtpInput } from "@/components/otp-input";

afterEach(() => {
  vi.useRealTimers();
});

function Harness({
  onComplete,
  status,
  resendIn,
  onResend,
  errorMessage,
  clearOnError,
}: {
  onComplete?: (code: string) => void;
  status?: "idle" | "verifying" | "error" | "success";
  resendIn?: number;
  onResend?: () => void;
  errorMessage?: string;
  clearOnError?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <OtpInput
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      status={status}
      errorMessage={errorMessage}
      clearOnError={clearOnError}
      inputTestId="otp-code"
      resendTestId="otp-resend"
      errorTestId="otp-error"
      onResend={onResend}
      resendIn={resendIn}
    />
  );
}

function boxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".otp-box"));
}

function chars(): HTMLElement[] {
  return Array.from(document.querySelectorAll(".otp-char"));
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

  it("pops a typed digit without delay but staggers a pasted code", () => {
    render(<Harness />);
    const input = screen.getByTestId("otp-code");
    fireEvent.change(input, { target: { value: "4" } });
    expect(chars()).toHaveLength(1);
    expect(chars()[0]?.style.animationDelay).toBe("0ms");

    fireEvent.change(input, { target: { value: "482913" } });
    expect(chars()).toHaveLength(6);
    // Five kept digits arrive one after another, 45ms apart.
    expect(chars()[1]?.style.animationDelay).toBe("0ms");
    expect(chars()[5]?.style.animationDelay).toBe("180ms");
  });

  it("inserts clipboard text through the paste handler", () => {
    const onChange = vi.fn();
    render(<OtpInput value="" onChange={onChange} inputTestId="otp-code" />);
    fireEvent.paste(screen.getByTestId("otp-code"), {
      clipboardData: { getData: () => "482 913" },
    });
    expect(onChange).toHaveBeenCalledWith("482913");
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

  it("slides the error message in below the boxes", () => {
    const { rerender } = render(
      <Harness status="idle" errorMessage="That code didn't work." />,
    );
    expect(document.querySelector(".otp-msg")?.getAttribute("data-show")).toBeNull();
    rerender(<Harness status="error" errorMessage="That code didn't work." />);
    expect(document.querySelector(".otp-msg")?.getAttribute("data-show")).toBe("true");
    expect(screen.getByTestId("otp-error")).toHaveTextContent(
      "That code didn't work.",
    );
  });

  it("clears the boxes shortly after an error", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <OtpInput
        value="000000"
        onChange={onChange}
        status="idle"
        errorMessage="Nope."
        inputTestId="otp-code"
      />,
    );
    rerender(
      <OtpInput
        value="000000"
        onChange={onChange}
        status="error"
        errorMessage="Nope."
        inputTestId="otp-code"
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("keeps the wrong code when clearing is off", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <OtpInput
        value="000000"
        onChange={onChange}
        status="idle"
        errorMessage="Nope."
        clearOnError={false}
        inputTestId="otp-code"
      />,
    );
    rerender(
      <OtpInput
        value="000000"
        onChange={onChange}
        status="error"
        errorMessage="Nope."
        clearOnError={false}
        inputTestId="otp-code"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("morphs into a Verified chip on success", () => {
    const { rerender } = render(<Harness status="idle" />);
    rerender(<Harness status="success" />);
    expect(document.querySelector(".otp")?.getAttribute("data-status")).toBe(
      "success",
    );
    // The chip and the polite live region share the label; pin the chip.
    expect(
      document.querySelector(".otp-pill-text")?.textContent,
    ).toBe("Verified");
    expect(document.querySelector(".otp-live")?.textContent).toBe("Verified");
  });

  it("shows a countdown while resend waits and a button when ready", () => {
    const onResend = vi.fn();
    const { rerender } = render(
      <Harness onResend={onResend} resendIn={30} />,
    );
    // The clock lives in its own span for a stable width; assert structurally.
    expect(document.querySelector(".otp-wait")?.textContent).toBe(
      "Resend in\u00a00:30",
    );
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
