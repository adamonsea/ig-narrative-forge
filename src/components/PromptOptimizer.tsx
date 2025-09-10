import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  analyzePrompt, 
  optimizePromptForProvider, 
  validatePromptStructure, 
  estimateAPICallCost,
  ClientPromptTemplates 
} from '@/lib/promptOptimization';
import { CheckCircle, AlertCircle, Lightbulb, DollarSign, Zap } from 'lucide-react';

interface PromptOptimizerProps {
  onOptimizedPrompt?: (prompt: string, provider: 'openai' | 'deepseek') => void;
  initialPrompt?: string;
  className?: string;
}

export const PromptOptimizer: React.FC<PromptOptimizerProps> = ({ 
  onOptimizedPrompt, 
  initialPrompt = '',
  className = '' 
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [provider, setProvider] = useState<'openai' | 'deepseek'>('openai');
  const [useStructuredFormat, setUseStructuredFormat] = useState(true);
  const [includeFewShot, setIncludeFewShot] = useState(false);
  const [optimizeForSpeed, setOptimizeForSpeed] = useState(false);
  const [maxTokens, setMaxTokens] = useState(4000);
  const [analysis, setAnalysis] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [optimizedPrompt, setOptimizedPrompt] = useState('');
  const [improvements, setImprovements] = useState<string[]>([]);

  useEffect(() => {
    if (prompt.length > 10) {
      const promptAnalysis = analyzePrompt(prompt, provider);
      const promptValidation = validatePromptStructure(prompt, provider);
      
      setAnalysis(promptAnalysis);
      setValidation(promptValidation);
    }
  }, [prompt, provider]);

  const handleOptimize = () => {
    const result = optimizePromptForProvider(prompt, {
      provider,
      maxTokens,
      includeFewShot,
      useStructuredFormat,
      optimizeForSpeed
    });
    
    setOptimizedPrompt(result.optimizedPrompt);
    setImprovements(result.improvements);
    
    if (onOptimizedPrompt) {
      onOptimizedPrompt(result.optimizedPrompt, provider);
    }
  };

  const loadTemplate = (templateKey: keyof typeof ClientPromptTemplates) => {
    const template = ClientPromptTemplates[templateKey][provider];
    setPrompt(template);
  };

  const costEstimate = prompt ? estimateAPICallCost(prompt, 1000, provider) : null;

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'simple': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'moderate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'complex': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            AI Prompt Optimizer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider Selection & Options */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={provider} onValueChange={(value: 'openai' | 'deepseek') => setProvider(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="structured" 
                checked={useStructuredFormat} 
                onCheckedChange={setUseStructuredFormat} 
              />
              <Label htmlFor="structured">Structured Format</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="fewshot" 
                checked={includeFewShot} 
                onCheckedChange={setIncludeFewShot} 
              />
              <Label htmlFor="fewshot">Few-shot Examples</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                id="speed" 
                checked={optimizeForSpeed} 
                onCheckedChange={setOptimizeForSpeed} 
              />
              <Label htmlFor="speed">Optimize for Speed</Label>
            </div>
          </div>

          {/* Template Loader */}
          <div className="space-y-2">
            <Label>Quick Templates</Label>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadTemplate('contentSummary')}
              >
                Content Summary
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadTemplate('keywordExtraction')}
              >
                Keyword Extraction
              </Button>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2">
            <Label>Your Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'DeepSeek'} prompt here...`}
              className="min-h-32"
            />
          </div>

          <Button onClick={handleOptimize} className="w-full">
            Optimize Prompt
          </Button>
        </CardContent>
      </Card>

      {/* Analysis & Validation */}
      {analysis && (
        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="cost">Cost Estimate</TabsTrigger>
          </TabsList>
          
          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Prompt Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Complexity:</span>
                    <Badge className={getComplexityColor(analysis.complexity)}>
                      {analysis.complexity}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Estimated Tokens:</span>
                    <Badge variant="outline">{analysis.estimatedTokens}</Badge>
                  </div>
                </div>
                
                {analysis.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">Suggestions</span>
                    </div>
                    {analysis.suggestions.map((suggestion: string, index: number) => (
                      <Alert key={index}>
                        <Lightbulb className="h-4 w-4" />
                        <AlertDescription>{suggestion}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="validation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {validation?.isValid ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  Validation Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {validation?.errors?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-red-600 dark:text-red-400">Errors</h4>
                    {validation.errors.map((error: string, index: number) => (
                      <Alert key={index} variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
                
                {validation?.warnings?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400">Warnings</h4>
                    {validation.warnings.map((warning: string, index: number) => (
                      <Alert key={index}>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
                
                {validation?.isValid && validation?.errors?.length === 0 && validation?.warnings?.length === 0 && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>Prompt structure looks good! No issues detected.</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="cost" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Cost Estimation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {costEstimate && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">Input Tokens</span>
                      <p className="text-lg font-medium">{costEstimate.inputTokens}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">Expected Output</span>
                      <p className="text-lg font-medium">{costEstimate.outputTokens}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">Estimated Cost</span>
                      <p className="text-lg font-medium">${costEstimate.estimatedCost.toFixed(6)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">Provider</span>
                      <p className="text-lg font-medium capitalize">{provider}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Optimized Result */}
      {optimizedPrompt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Optimized Prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {improvements.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Improvements Applied</h4>
                {improvements.map((improvement, index) => (
                  <Alert key={index}>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>{improvement}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Optimized Prompt</Label>
              <Textarea
                value={optimizedPrompt}
                readOnly
                className="min-h-32 font-mono text-sm"
              />
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => navigator.clipboard.writeText(optimizedPrompt)}
              className="w-full"
            >
              Copy to Clipboard
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};