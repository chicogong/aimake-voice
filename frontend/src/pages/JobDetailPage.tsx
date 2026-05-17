/**
 * JobDetailPage — Real-time SSE progress + audio result
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Loader2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useJobStream } from '@/hooks/useJobStream';
import { jobsApi } from '@/services/api';
import { ScriptEditor } from '@/components/ScriptEditor';
import type { JobDetail } from '@/types';
import { formatDuration, parseScript } from '@/lib/utils';

const STAGE_LABELS: Record<string, string> = {
  pending: '等待中',
  classifying: '分析内容类型',
  extracting: '提取内容',
  analyzing: '分析要点',
  scripting: '生成脚本',
  synthesizing: '语音合成',
  assembling: '拼接音频',
  completed: '完成',
  failed: '失败',
};

function ScriptStreamView({ scriptJson }: { scriptJson: string | null }) {
  if (!scriptJson) return null;

  const script = parseScript(scriptJson);
  if (!script || !script.segments || script.segments.length === 0) return null;

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar mt-4 border-t pt-4">
      <h3 className="text-sm font-semibold sticky top-0 bg-card py-1">实时脚本</h3>
      <div className="space-y-3">
        {script.segments.map((seg, i) => (
          <div
            key={i}
            className="flex gap-3 text-sm animate-in fade-in slide-in-from-left-2 duration-500"
          >
            <div className="flex-shrink-0 w-12 font-bold text-primary/70 uppercase text-[10px] mt-1">
              {seg.speaker}
            </div>
            <div className="flex-1 text-muted-foreground leading-relaxed">{seg.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const streamToken = searchParams.get('token');

  const [job, setJob] = useState<(JobDetail & { isEditing?: boolean }) | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const rafRef = useRef<number>(0);

  const stream = useJobStream(id ?? null, streamToken);

  // Audio time tracking
  const updateTime = useCallback(() => {
    if (audioElement) {
      setCurrentTime(audioElement.currentTime);
      if (!audioElement.paused) {
        rafRef.current = requestAnimationFrame(updateTime);
      }
    }
  }, [audioElement]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
      audioElement?.pause();
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioBlobUrl, audioElement]);

  // Fetch job detail on mount
  useEffect(() => {
    if (!id) return;
    jobsApi
      .getDetail(id)
      .then((res: any) => {
        setJob(res.data);
        setFetchError(null);
      })
      .catch((err: any) => {
        setFetchError(err?.message || '无法加载任务详情');
      });
  }, [id]);

  // Update job data when stream completes
  useEffect(() => {
    if (stream.status === 'completed' && id) {
      jobsApi.getDetail(id).then((res: any) => {
        setJob(res.data);
      });
    }
  }, [stream.status, id]);

  // Use job detail status as initial, override with stream status when stream is active
  const currentStatus = stream.status !== 'pending' ? stream.status : job?.status || 'pending';
  const currentProgress = stream.progress > 0 ? stream.progress : job?.progress || 0;
  const currentStage = stream.currentStage || job?.currentStage;
  const audioUrl = stream.audioUrl || job?.audioUrl;
  const duration = stream.duration || job?.duration;

  const isTerminal = currentStatus === 'completed' || currentStatus === 'failed';

  const fetchAudioBlob = async (): Promise<string | null> => {
    if (audioBlobUrl) return audioBlobUrl;
    if (!id) return null;

    setIsLoadingAudio(true);
    try {
      const blob = await jobsApi.downloadAudio(id);
      const url = URL.createObjectURL(blob);
      setAudioBlobUrl(url);
      return url;
    } catch (err) {
      console.error('Failed to load audio:', err);
      return null;
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handlePlayPause = async () => {
    if (!audioUrl || !id) return;

    if (audioElement) {
      if (isPlaying) {
        audioElement.pause();
        setIsPlaying(false);
        cancelAnimationFrame(rafRef.current);
      } else {
        audioElement.play();
        setIsPlaying(true);
        rafRef.current = requestAnimationFrame(updateTime);
      }
      return;
    }

    const blobUrl = await fetchAudioBlob();
    if (!blobUrl) return;

    const audio = new Audio(blobUrl);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      cancelAnimationFrame(rafRef.current);
    };
    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration);
    };
    audio.play();
    setIsPlaying(true);
    setAudioElement(audio);
    rafRef.current = requestAnimationFrame(updateTime);
  };

  const handleSeek = (value: number[]) => {
    if (audioElement) {
      audioElement.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownload = async () => {
    if (!id) return;

    const blobUrl = await fetchAudioBlob();
    if (!blobUrl) return;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${job?.title || 'audio'}.${job?.audioFormat || 'mp3'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Back link */}
      <Link
        to="/history"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        返回历史记录
      </Link>

      <div className="space-y-6">
        {/* Fetch error state */}
        {fetchError && !job && (
          <div className="bg-card border border-destructive/20 rounded-xl p-6 space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">加载失败</span>
            </div>
            <p className="text-sm text-muted-foreground">{fetchError}</p>
            <Link to="/history">
              <Button variant="outline" size="sm" className="mt-2">
                返回历史记录
              </Button>
            </Link>
          </div>
        )}

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold">{job?.title || '生成中...'}</h1>
          {job?.contentType && (
            <span className="inline-block mt-2 px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
              {job.contentType}
            </span>
          )}
        </div>

        {/* Progress section */}
        {!isTerminal && (
          <div className="bg-card border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {STAGE_LABELS[currentStage || currentStatus] || currentStatus}
              </span>
              <span className="text-sm text-muted-foreground">{currentProgress}%</span>
            </div>
            <Progress value={currentProgress} className="h-2" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {stream.isConnected ? '实时更新中...' : '连接中...'}
            </div>

            <ScriptStreamView scriptJson={stream.script || job?.script || null} />
          </div>
        )}

        {/* Completed */}
        {currentStatus === 'completed' && (
          <div className="bg-card border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">生成完成</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setJob((prev) => (prev ? { ...prev, isEditing: !prev.isEditing } : null))
                }
              >
                <Edit3 className="h-4 w-4 mr-1" />
                {job?.isEditing ? '取消编辑' : '修改脚本'}
              </Button>
            </div>

            {job?.isEditing ? (
              <ScriptEditor
                jobId={id!}
                initialScript={job.script || ''}
                onUpdate={() => {
                  setJob((prev) => (prev ? { ...prev, isEditing: false } : null));
                  jobsApi.getDetail(id!).then((res: any) => setJob(res.data));
                }}
              />
            ) : (
              <>
                {/* Audio player */}
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handlePlayPause}
                      disabled={isLoadingAudio}
                      className="h-12 w-12 rounded-full flex-shrink-0"
                      aria-label={isPlaying ? '暂停' : '播放'}
                    >
                      {isLoadingAudio ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5 ml-0.5" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job?.title || '音频'}</p>
                      <p className="text-xs text-muted-foreground">
                        {duration ? formatDuration(duration) : '--:--'}
                      </p>
                    </div>
                    {id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        disabled={isLoadingAudio}
                        aria-label="下载音频"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        下载
                      </Button>
                    )}
                  </div>
                  {/* Seek bar + time display */}
                  {audioElement && audioDuration > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {formatTime(currentTime)}
                      </span>
                      <Slider
                        value={[currentTime]}
                        max={audioDuration}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="flex-1"
                        aria-label="音频进度"
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-10">
                        {formatTime(audioDuration)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Script preview */}
                {job?.script && (
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                      查看脚本
                    </summary>
                    <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-auto max-h-96">
                      {(() => {
                        const parsedScript = parseScript(job.script);
                        return parsedScript ? JSON.stringify(parsedScript, null, 2) : job.script;
                      })()}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        {/* Failed */}
        {currentStatus === 'failed' && (
          <div className="bg-card border border-destructive/20 rounded-xl p-6 space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">生成失败</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {stream.error?.message || job?.error?.message || '未知错误'}
            </p>
            <Link to="/">
              <Button variant="outline" size="sm" className="mt-2">
                重新生成
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
