/**
 * CreatePage — Unified content creation flow
 * Three steps: Input → Content Type → Settings → Generate
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { Mic, Globe, FileText, Sparkles, BookOpen, Radio, Film, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { jobsApi } from '@/services/api';
import type { ContentType, SourceType, CreateJobRequest, Voice } from '@/types';
import { useToast } from '@/hooks/useToast';
import { VoiceSelector } from '@/components/tts/VoiceSelector';
import { MAX_TEXT_LENGTH, validateCreateJobInput } from '@/lib/validation';

const CONTENT_TYPES = [
  { id: 'auto' as const, label: '自动检测', icon: Sparkles, description: 'AI 自动判断最佳类型' },
  { id: 'podcast' as const, label: '播客', icon: Radio, description: '双人对话式节目' },
  { id: 'audiobook' as const, label: '有声书', icon: BookOpen, description: '叙述式朗读' },
  { id: 'voiceover' as const, label: '配音', icon: Film, description: '精炼旁白' },
  { id: 'education' as const, label: '教育', icon: GraduationCap, description: '讲解式内容' },
];

const DURATIONS = [
  { value: 1, label: '1 分钟' },
  { value: 3, label: '3 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 10, label: '10 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 20, label: '20 分钟' },
];

export function CreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Step state
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [sourceContent, setSourceContent] = useState('');
  const [contentType, setContentType] = useState<'auto' | ContentType>('auto');
  const [duration, setDuration] = useState(5);
  const [title, setTitle] = useState('');
  const [selectedVoices, setSelectedVoices] = useState<Array<{ role: string; voiceId: string }>>(
    []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVoiceSelect = (voice: Voice, role: string) => {
    setSelectedVoices((prev) => {
      const existing = prev.findIndex((v) => v.role === role);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { role, voiceId: voice.id };
        return updated;
      }
      return [...prev, { role, voiceId: voice.id }];
    });
  };

  const handleSubmit = async () => {
    const validation = validateCreateJobInput({
      sourceType,
      sourceContent,
      voiceCount: selectedVoices.length,
    });
    if (!validation.ok) {
      toast({ title: validation.message, variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      const request: CreateJobRequest = {
        source: {
          type: sourceType,
          content: sourceContent,
        },
        contentType,
        settings: {
          duration,
          language: 'zh',
          voices: selectedVoices,
        },
        title: title || undefined,
      };

      const response = (await jobsApi.create(request)) as unknown as {
        data: { id: string; streamToken: string };
      };
      const { id, streamToken } = response.data;

      navigate(`/jobs/${id}?token=${streamToken}`);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      toast({
        title: '创建失败',
        description: err?.message || '请稍后再试',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            创建声音内容
          </h1>
          <p className="text-muted-foreground">输入文本或 URL，AI 自动生成播客、有声书、配音等</p>
        </div>

        <SignedOut>
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">请先登录以使用创建功能</p>
            <SignInButton mode="modal">
              <Button variant="gradient" size="lg">
                登录开始
              </Button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          {/* Step 1: Input */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                1
              </span>
              输入素材
            </h2>

            {/* Source type tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setSourceType('text')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  sourceType === 'text'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <FileText className="h-4 w-4" />
                文本
              </button>
              <button
                onClick={() => setSourceType('url')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                  sourceType === 'url'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <Globe className="h-4 w-4" />
                URL
              </button>
            </div>

            {/* Input field */}
            {sourceType === 'text' ? (
              <div className="relative">
                <textarea
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                  placeholder="粘贴文章、故事、新闻或任何你想转化为声音的文本..."
                  className="w-full h-48 p-4 pb-8 border rounded-xl bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                  maxLength={MAX_TEXT_LENGTH}
                />
                <span
                  className={`absolute bottom-2 right-3 text-xs ${sourceContent.length > MAX_TEXT_LENGTH * 0.9 ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {sourceContent.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()}
                </span>
              </div>
            ) : (
              <input
                type="url"
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full p-4 border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}

            {/* Optional title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题（可选）"
              className="w-full p-3 border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Step 2: Content Type */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                2
              </span>
              选择类型
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {CONTENT_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => {
                      setContentType(type.id);
                      setSelectedVoices([]);
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                      contentType === type.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 ${contentType === type.id ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span className="text-sm font-medium">{type.label}</span>
                    <span className="text-xs text-muted-foreground text-center">
                      {type.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Settings */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                3
              </span>
              设置参数
            </h2>

            {/* Duration */}
            <div className="space-y-2">
              <label className="text-sm font-medium">目标时长</label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                      duration === d.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {contentType === 'podcast' ? '选择主持人音色' : '选择音色'}
              </label>
              <VoiceSelector
                onSelect={(voice) =>
                  handleVoiceSelect(voice, contentType === 'podcast' ? 'host' : 'narrator')
                }
                selectedId={
                  selectedVoices.find((v) => v.role === 'host' || v.role === 'narrator')?.voiceId
                }
              />
            </div>

            {/* Second voice for podcast/education */}
            {(contentType === 'podcast' || contentType === 'education') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {contentType === 'podcast' ? '选择嘉宾音色' : '选择学生音色'}
                </label>
                <VoiceSelector
                  onSelect={(voice) =>
                    handleVoiceSelect(voice, contentType === 'podcast' ? 'guest' : 'student')
                  }
                  selectedId={
                    selectedVoices.find((v) => v.role === 'guest' || v.role === 'student')?.voiceId
                  }
                />
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-center pt-4">
            <Button
              variant="gradient"
              size="lg"
              onClick={handleSubmit}
              disabled={isSubmitting || !sourceContent.trim() || selectedVoices.length === 0}
              className="px-12"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  创建中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  开始生成
                </span>
              )}
            </Button>
          </div>
        </SignedIn>
      </div>
    </div>
  );
}
