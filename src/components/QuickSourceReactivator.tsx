import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTopicSources } from '@/hooks/useTopicSources';
import { RefreshCw } from 'lucide-react';

export const QuickSourceReactivator = () => {
  const { reactivateAndTestSource, loading } = useTopicSources();
  const [testing, setTesting] = useState(false);

  const handleReactivate = async () => {
    setTesting(true);
    await reactivateAndTestSource(
      'c2c27053-16c7-4e90-8869-40ba249508eb', // Eastbourne source
      'd224e606-1a4c-4713-8135-1d30e2d6d0c6'  // Eastbourne topic
    );
    setTesting(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        onClick={handleReactivate}
        disabled={loading || testing}
        className="shadow-lg"
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${testing ? 'animate-spin' : ''}`} />
        Reactivate & Test Eastbourne Source
      </Button>
    </div>
  );
};
