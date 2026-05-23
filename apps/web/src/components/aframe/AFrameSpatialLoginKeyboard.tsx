"use client";

import { createElement, useEffect, useRef, type ReactNode } from "react";

type LoginMode = "login" | "register";
type LoginField = "email" | "password";

type AFrameSpatialLoginKeyboardProps = {
  activeField: LoginField;
  email: string;
  mode: LoginMode;
  password: string;
  status: string;
  onAppend: (value: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onFieldChange: (field: LoginField) => void;
  onModeChange: (mode: LoginMode) => void;
  onSubmit: () => void;
};

type SpatialButtonProps = {
  children?: ReactNode;
  color?: string;
  depth?: number;
  disabled?: boolean;
  id: string;
  label: string;
  onPress: () => void;
  position: string;
  width?: number;
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const DEEP = "#070011";
const PANEL = "#1a103c";

const keyRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", "@", "."]
];

function keyMaterial(color: string, opacity = 0.88) {
  return `shader: standard; color: ${color}; emissive: ${color}; emissiveIntensity: 0.34; metalness: 0.08; roughness: 0.34; opacity: ${opacity}; transparent: true`;
}

function safeValue(value: string, isPassword = false) {
  if (!value) {
    return "-";
  }

  return isPassword ? "*".repeat(Math.min(value.length, 16)) : value.slice(-26);
}

function SpatialButton({
  children,
  color = CYAN,
  depth = 0.08,
  disabled = false,
  id,
  label,
  onPress,
  position,
  width = 0.18
}: SpatialButtonProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el || disabled) {
      return;
    }

    const currentEl = el;
    let timer: number | null = null;

    function restore() {
      currentEl.setAttribute("animation__press", "property: scale; to: 1 1 1; dur: 70; easing: easeOutQuad");
    }

    function handleClick(event: Event) {
      event.stopPropagation();
      currentEl.setAttribute("animation__press", "property: scale; to: 0.94 0.82 0.94; dur: 45; easing: easeOutQuad");
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(restore, 110);
      onPress();
    }

    currentEl.addEventListener("click", handleClick);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      currentEl.removeEventListener("click", handleClick);
    };
  }, [disabled, onPress]);

  return createElement(
    "a-entity",
    {
      ref,
      className: disabled ? "" : "clickable",
      "data-testid": `xr-spatial-key-${id}`,
      position
    },
    createElement("a-box", {
      depth: String(depth),
      height: "0.055",
      material: keyMaterial(disabled ? "#3a3146" : color, disabled ? 0.42 : 0.9),
      width: String(width)
    }),
    createElement("a-text", {
      align: "center",
      color: "#ffffff",
      material: `shader: msdf; emissive: ${disabled ? "#6f657d" : color}; emissiveIntensity: 0.65`,
      position: "0 0.033 0.003",
      rotation: "-90 0 0",
      scale: "0.16 0.16 0.16",
      value: label
    }),
    children
  );
}

function keyboardKeys(onAppend: (value: string) => void) {
  const rowGap = 0.145;
  const keyGap = 0.205;

  return keyRows.flatMap((row, rowIndex) => {
    const y = 0.03 - rowIndex * rowGap;
    const offset = -((row.length - 1) * keyGap) / 2;

    return row.map((key, keyIndex) =>
      createElement(SpatialButton, {
        key: `${rowIndex}-${key}`,
        color: rowIndex % 2 === 0 ? CYAN : MAGENTA,
        id: `key-${key === "." ? "dot" : key === "@" ? "at" : key}`,
        label: key.toUpperCase(),
        onPress: () => onAppend(key),
        position: `${offset + keyIndex * keyGap} ${y} 0`,
        width: 0.17
      })
    );
  });
}

export function AFrameSpatialLoginKeyboard({
  activeField,
  email,
  mode,
  password,
  status,
  onAppend,
  onBackspace,
  onClear,
  onFieldChange,
  onModeChange,
  onSubmit
}: AFrameSpatialLoginKeyboardProps) {
  const canSubmit = email.includes("@") && password.length >= 6;

  return createElement(
    "a-entity",
    {
      "data-testid": "xr-spatial-login-keyboard",
      position: "0 1.32 -1.95",
      rotation: "-18 0 0"
    },
    createElement("a-box", {
      depth: "0.04",
      height: "1.16",
      material: "shader: standard; color: #120521; emissive: #1a103c; emissiveIntensity: 0.34; opacity: 0.72; transparent: true",
      position: "0 -0.22 -0.035",
      width: "2.52"
    }),
    createElement("a-text", {
      align: "center",
      color: CYAN,
      material: `shader: msdf; emissive: ${CYAN}; emissiveIntensity: 0.8`,
      position: "0 0.45 0.02",
      rotation: "-90 0 0",
      scale: "0.18 0.18 0.18",
      value: "XR LOGIN KEYBOARD"
    }),
    createElement(SpatialButton, {
      color: activeField === "email" ? ORANGE : CYAN,
      id: "field-email",
      label: `EMAIL ${safeValue(email)}`,
      onPress: () => onFieldChange("email"),
      position: "-0.58 0.31 0.01",
      width: 1.1
    }),
    createElement(SpatialButton, {
      color: activeField === "password" ? ORANGE : MAGENTA,
      id: "field-password",
      label: `PASS ${safeValue(password, true)}`,
      onPress: () => onFieldChange("password"),
      position: "0.58 0.31 0.01",
      width: 1.1
    }),
    createElement(
      "a-entity",
      {
        position: "0 0.14 0.03"
      },
      ...keyboardKeys(onAppend)
    ),
    createElement(SpatialButton, {
      color: ORANGE,
      id: "space",
      label: "SPACE",
      onPress: () => onAppend(" "),
      position: "-0.48 -0.56 0.03",
      width: 0.72
    }),
    createElement(SpatialButton, {
      color: MAGENTA,
      id: "backspace",
      label: "BACK",
      onPress: onBackspace,
      position: "0.08 -0.56 0.03",
      width: 0.34
    }),
    createElement(SpatialButton, {
      color: MAGENTA,
      id: "clear",
      label: "CLEAR",
      onPress: onClear,
      position: "0.44 -0.56 0.03",
      width: 0.34
    }),
    createElement(SpatialButton, {
      color: mode === "login" ? CYAN : MAGENTA,
      id: "mode",
      label: mode === "login" ? "LOGIN" : "REGISTER",
      onPress: () => onModeChange(mode === "login" ? "register" : "login"),
      position: "0.84 -0.56 0.03",
      width: 0.42
    }),
    createElement(SpatialButton, {
      color: canSubmit ? ORANGE : "#4a405c",
      disabled: !canSubmit,
      id: "submit",
      label: "ENTER",
      onPress: onSubmit,
      position: "0 -0.72 0.03",
      width: 0.82
    }),
    createElement("a-text", {
      align: "center",
      color: "#e0e0e0",
      material: `shader: msdf; emissive: ${DEEP}; emissiveIntensity: 0.25`,
      position: "0 -0.86 0.03",
      rotation: "-90 0 0",
      scale: "0.12 0.12 0.12",
      value: status.slice(0, 80)
    })
  );
}
