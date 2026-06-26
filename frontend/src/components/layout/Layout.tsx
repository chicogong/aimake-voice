/**
 * Layout Component
 * Main app layout wrapper
 */

import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Toaster } from '@/components/ui/toaster';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">© 2026 AIMake. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a
                href="https://studio.aimake.cc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                官网
              </a>
              <a
                href="https://studio.aimake.cc/docs.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                文档
              </a>
              <a
                href="mailto:support@aimake.cc"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                联系我们
              </a>
            </div>
          </div>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
