import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '../components/app-shell';
import { InteractionProvider } from '../components/interaction-provider';

export const metadata: Metadata = { title: 'Flinkout', description: 'Move together.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><InteractionProvider><AppShell>{children}</AppShell></InteractionProvider></body></html>; }
