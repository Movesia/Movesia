import fs from 'node:fs';
import path from 'node:path';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
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
  'bindings',           // dependency of better-sqlite3 (finds .node files)
  'file-uri-to-path',   // dependency of bindings
  'prebuild-install',   // dependency of better-sqlite3
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
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        for (const mod of nativeModules) {
          const src = path.resolve(rootDir, 'node_modules', mod);
          const dst = path.resolve(buildPath, 'node_modules', mod);
          if (fs.existsSync(src)) {
            fs.cpSync(src, dst, { recursive: true });
          }
        }
        callback();
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: productName,
      setupIcon: path.resolve(rootDir, 'assets/icons/icon.ico'),
      // Register movesia:// protocol on Windows during install
      // This creates registry entries for the protocol handler
    }),
    new MakerZIP({}, ['darwin']),
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
      repository: { owner: 'Hannyel0', name: 'Movesia' },
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
          config: 'config/vite.main.config.ts'
        },
        {
          entry: 'src/preload.ts',
          config: 'config/vite.preload.config.ts'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'config/vite.renderer.config.ts'
        }
      ]
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
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};

export default config;
