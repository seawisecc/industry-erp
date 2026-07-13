"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email atau password salah.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleLogin}
        className="glass rounded-2xl p-8 w-full max-w-[380px]"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-botanical-900/90 rounded-xl p-2 shadow-sm">
            <Logo size={24} />
          </div>
          <div>
            <div className="font-display font-semibold text-[16px]">Industry Cosmetic</div>
            <div className="text-[11px] text-muted">ERP</div>
          </div>
        </div>

        <label className="block text-[12.5px] font-medium text-muted mb-1.5">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full glass-input rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-botanical-700"
          placeholder="nama@dnalab.co.id"
        />

        <label className="block text-[12.5px] font-medium text-muted mb-1.5">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full glass-input rounded-lg px-3 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-botanical-700"
        />

        {error && <p className="text-clay-600 text-[12.5px] mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
        >
          {loading ? "Masuk..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}