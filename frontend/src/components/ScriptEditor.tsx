import { useState } from 'react';
import { Plus, Trash2, Save, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { jobsApi } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import type { GeneratedScript } from '@/types';
import { parseScript } from '@/lib/utils';

interface ScriptEditorProps {
  jobId: string;
  initialScript: string;
  onUpdate: () => void;
}

export function ScriptEditor({ jobId, initialScript, onUpdate }: ScriptEditorProps) {
  const { toast } = useToast();
  const [script, setScript] = useState<GeneratedScript>(
    () => parseScript(initialScript) ?? { title: 'New Script', segments: [], estimatedDuration: 0 }
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const handleUpdateSegment = (index: number, updates: any) => {
    const newSegments = [...script.segments];
    newSegments[index] = { ...newSegments[index], ...updates };
    setScript({ ...script, segments: newSegments });
  };

  const handleAddSegment = (index: number) => {
    const newSegments = [...script.segments];
    newSegments.splice(index + 1, 0, {
      index: 0,
      speaker: 'host',
      text: '',
      emotion: 'neutral',
      speed: 1.0,
    } as any);
    setScript({ ...script, segments: newSegments });
  };

  const handleRemoveSegment = (index: number) => {
    const newSegments = script.segments.filter((_, i) => i !== index);
    setScript({ ...script, segments: newSegments });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sanitizedScript = {
        ...script,
        segments: script.segments.map((s, i) => ({ ...s, index: i })),
      };
      await jobsApi.updateScript(jobId, JSON.stringify(sanitizedScript));
      toast({ title: '脚本已保存' });
      onUpdate();
    } catch (err) {
      const error = err as { message?: string };
      toast({
        title: '保存失败',
        description: error?.message || '请稍后再试',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSynthesize = async () => {
    setIsSaving(true);
    try {
      const sanitizedScript = {
        ...script,
        segments: script.segments.map((s, i) => ({ ...s, index: i })),
      };
      await jobsApi.updateScript(jobId, JSON.stringify(sanitizedScript));
    } catch (err) {
      const error = err as { message?: string };
      toast({
        title: '保存失败，无法开始合成',
        description: error?.message || '请稍后再试',
        variant: 'destructive',
      });
      setIsSaving(false);
      return;
    }
    setIsSaving(false);

    setIsSynthesizing(true);
    try {
      await jobsApi.synthesize(jobId);
      toast({ title: '合成已开始' });
      onUpdate();
    } catch (err) {
      const error = err as { message?: string };
      toast({
        title: '合成失败',
        description: error?.message || '请稍后再试',
        variant: 'destructive',
      });
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b">
        <h2 className="text-lg font-semibold">编辑脚本</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isSynthesizing}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            保存
          </Button>
          <Button size="sm" onClick={handleSynthesize} disabled={isSaving || isSynthesizing}>
            {isSynthesizing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            开始合成
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {script.segments.map((seg, i) => (
          <div
            key={i}
            className="group relative border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="w-24 space-y-2">
                <Input
                  className="text-[10px] font-bold uppercase h-8"
                  value={seg.speaker}
                  onChange={(e) => handleUpdateSegment(i, { speaker: e.target.value })}
                  placeholder="角色"
                />
                <select
                  className="w-full text-[10px] border rounded h-8 px-1"
                  value={seg.emotion || 'neutral'}
                  onChange={(e) => handleUpdateSegment(i, { emotion: e.target.value })}
                >
                  <option value="neutral">中性</option>
                  <option value="excited">兴奋</option>
                  <option value="thoughtful">沉思</option>
                  <option value="serious">严肃</option>
                </select>
              </div>

              <div className="flex-1">
                <Textarea
                  className="min-h-[80px] text-sm leading-relaxed resize-none border-none focus-visible:ring-0 p-0"
                  value={seg.text}
                  onChange={(e) => handleUpdateSegment(i, { text: e.target.value })}
                  placeholder="请输入台词..."
                />
              </div>

              <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleRemoveSegment(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleAddSegment(i)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {script.segments.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed rounded-xl">
            <p className="text-muted-foreground mb-4">暂无脚本片段</p>
            <Button variant="outline" onClick={() => handleAddSegment(-1)}>
              <Plus className="h-4 w-4 mr-2" />
              添加第一个片段
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
