export default function Home() {
  return (
    <main className="mx-auto mt-24 flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-gray-900">ERP V2</h1>
      <p className="text-sm text-gray-500">Facebook COD ERP V2 本地演示环境</p>
      <a href="/login" className="rounded bg-black px-4 py-2 text-sm font-semibold text-white">
        登录
      </a>
      <a href="/admin" className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700">
        进入管理后台
      </a>
    </main>
  );
}
