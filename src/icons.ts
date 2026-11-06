import {
  createIcons, Cpu, Trophy, Pause, Play, Shield, Zap, Swords, MousePointer2, Globe,
  ShoppingBag, BarChart3, Settings, ArrowLeft, RadioTower, Plus, Copy, Loader2, LogIn,
  CircleDot, Wind, Sparkles, X, Lightbulb, Gauge, Activity, Repeat, ChevronRight,
  RotateCcw, House, LogOut, Volume2, Music, Layers, Crosshair, Vibrate, EyeOff,
  Gamepad2, Percent, Flame, Timer, Skull, Lock, Bot, Ghost, Crown, Worm, Check,
  Download, Share2, Share, Smartphone, Maximize, Expand, BatteryCharging, Layout,
  ArrowDownToLine, PlusSquare, MoreVertical, FileText,
} from 'lucide';

const icons = {
  Cpu, Trophy, Pause, Play, Shield, Zap, Swords, MousePointer2, Globe, ShoppingBag,
  BarChart3, Settings, ArrowLeft, RadioTower, Plus, Copy, Loader2, LogIn, CircleDot,
  Wind, Sparkles, X, Lightbulb, Gauge, Activity, Repeat, ChevronRight, RotateCcw,
  House, LogOut, Volume2, Music, Layers, Crosshair, Vibrate, EyeOff, Gamepad2,
  Percent, Flame, Timer, Skull, Lock, Bot, Ghost, Crown, Worm, Check,
  Download, Share2, Share, Smartphone, Maximize, Expand, BatteryCharging, Layout,
  ArrowDownToLine, PlusSquare, MoreVertical, FileText,
};

export const refreshIcons = () => createIcons({ icons });

/** Replace an element's content with [icon] + text, so setting a label never wipes its icon. */
export const setLabel = (
  el: HTMLElement,
  text: string,
  icon?: string,
  opts: { after?: boolean; spin?: boolean } = {}
) => {
  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = text;
  let i: HTMLElement | null = null;
  if (icon) {
    i = document.createElement('i');
    i.setAttribute('data-lucide', icon);
    if (opts.spin) i.className = 'spin';
  }
  if (i && !opts.after) el.append(i);
  el.append(span);
  if (i && opts.after) el.append(i);
  refreshIcons();
};