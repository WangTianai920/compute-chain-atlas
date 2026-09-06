"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh" | "en";

const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("zh");

  useEffect(() => {
    const saved = window.localStorage.getItem("compute-chain-locale");
    if (saved === "en" || saved === "zh") {
      const frame = window.requestAnimationFrame(() => setLocale(saved));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.locale = locale;
    window.localStorage.setItem("compute-chain-locale", locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();
  return <button className="language-toggle" type="button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")} aria-label={locale === "zh" ? "Switch to English" : "切换至中文"}>
    <span className={locale === "zh" ? "active" : ""}>中</span><i>/</i><span className={locale === "en" ? "active" : ""}>EN</span>
  </button>;
}
