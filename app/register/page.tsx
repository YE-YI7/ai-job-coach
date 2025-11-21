"use client";

import RegisterForm from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl mb-4">
            <span className="text-3xl">🚀</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            AI Job Coach
          </h1>
          <p className="text-gray-600">
            请填写以下信息，让我们更好地为您服务
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}

