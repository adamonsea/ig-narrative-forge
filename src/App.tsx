import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="p-8">
        <h1 className="text-2xl font-bold">eeZee News - Testing</h1>
        <p>If you see this, React is working correctly.</p>
      </div>
    </QueryClientProvider>
  );
};

export default App;
