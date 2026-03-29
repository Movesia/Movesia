import fs from 'node:fs';
import path from 'node:path';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';

import { author, productName } from './package.json';

import type { ForgeConfig } from '@electron-forge/shared-types';

const rootDir = process.cwd();

/**
 * Native modules that can't be bundled by Vite.
 * These get copied into the package's node_modules and unpacked from the asar.
 */
const nativeModules = [
  'better-sqlite3',
  'bindings', // dependency of better-sqlite3 (finds .node files)
  'file-uri-to-path', // dependency of bindings
  'prebuild-install', // dependency of better-sqlite3
];

const config: ForgeConfig = {
  packagerConfig: {
    // Create asar archive — native modules are unpacked alongside it
    asar: {
      unpack: `**/node_modules/{${nativeModules.join(',')}}/**`,
    },
    // Set executable name
    executableName: productName,
    // Set application copyright
    appCopyright: `Copyright © ${new Date().getFullYear()} ${author.name}`,
    // Set application icon
    icon: path.resolve(rootDir, 'assets/icons/icon'),
    // Register movesia:// protocol on macOS
    protocols: [
      {
        name: 'Movesia',
        schemes: ['movesia'],
      },
    ],
    // Copy native modules into the package (Vite doesn't include node_modules)
    // then rebuild them against Electron's Node headers so ABI versions match.
    afterCopy: [
      async (buildPath, electronVersion, platform, arch, callback) => {
        try {
          // 1. Copy native modules (Vite doesn't include node_modules)
          for (const mod of nativeModules) {
            const src = path.resolve(rootDir, 'node_modules', mod);
            const dst = path.resolve(buildPath, 'node_modules', mod);
            if (fs.existsSync(src)) {
              fs.cpSync(src, dst, { recursive: true });
            }
          }

          // 2. Rebuild native modules for Electron's Node version
          const { rebuild } = await import('@electron/rebuild');
          await rebuild({
            buildPath,
            electronVersion,
            arch,
            onlyModules: ['better-sqlite3'],
            force: true,
          });

          callback();
        } catch (err) {
          callback(err as Error);
        }
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: productName,
      setupIcon: path.resolve(rootDir, 'assets/icons/icon.ico'),
      loadingGif: path.resolve(rootDir, 'assets/icons/Movesia-FullLogo-White.png'),
      // Apps & Features metadata
      authors: author.name,
      title: productName,
      description:
        'AI-powered desktop assistant for Unity Editor — manage scenes, GameObjects, and scripts through natural conversation',
      iconUrl: 'https://cdn.movesia.com/assets/icon.ico',
      copyright: `Copyright © ${new Date().getFullYear()} ${author.name}`,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      icon: path.resolve(rootDir, 'assets/icons/icon.icns'),
      background: path.resolve(rootDir, 'assets/dmgBackgroundImage.png'),
    }),
    new MakerRpm({
      options: {
        // Register movesia:// protocol on Linux (RPM)
        mimeType: ['x-scheme-handler/movesia'],
      },
    }),
    new MakerDeb({
      options: {
        // Register movesia:// protocol on Linux (DEB)
        mimeType: ['x-scheme-handler/movesia'],
      },
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: 'Movesia', name: 'Movesia' },
      prerelease: true,
      draft: true,
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'config/vite.main.config.ts',
        },
        {
          entry: 'src/preload.ts',
          config: 'config/vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'config/vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
