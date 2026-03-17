const isNisis = process.env.NISIS_BUILD === 'true';

module.exports = {
  packagerConfig: {
    asar: true,
    name: isNisis ? 'NISIS Digital Reporting' : 'X-TES Digital Reporting',
    icon: 'assets/icon.ico',
    executableName: isNisis ? 'NISIS Digital Reporting' : 'X-TES Digital Reporting',
    extraResource: [
      'assets',
    ],
    fileAssociations: [
      {
        ext: 'spdfr',
        name: 'SaskPower DFR Project',
        icon: 'assets/SASKPOWERICON.ico'
      },
      {
        ext: 'dfr',
        name: 'X-TES DFR Project',
        icon: 'assets/XTERRAICON.ico'
      },
      {
        ext: 'plog',
        name: 'X-TES Photo Log',
        icon: 'assets/PHOTOLOGICON.ico'
      },
      {
        ext: 'clog',
        name: 'X-TES Combine Logs',
        icon: 'assets/COMBINEDLOGICON.ico'
      }
    ]
  },
  rebuildConfig: {},
  makers: isNisis
    ? [
        {
          name: '@electron-addons/electron-forge-maker-nsis',
          config: {
            icon: 'assets/icon.ico',
            createDesktopShortcut: true,
            createStartMenuShortcut: true,
          },
        },
      ]
    : [
        {
          name: '@electron-forge/maker-squirrel',
          config: {
            name: 'x-tec-digital-reporting-web',
            exe: 'X-TES Digital Reporting.exe',
            setupIcon: 'assets/icon.ico',
            loadingGif: 'assets/install-loading.gif',
            createDesktopShortcut: true,
          },
        },
      ],
  publishers: [
    {
      name: '@electron-forge/publisher-electron-release-server',
      config: {
        baseUrl: 'https://update.electronjs.org',
        repo: 'kschreiner03/XTES-Digital-Reporting'
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` specifies the Vite build configurations for your main process and preload scripts.
        build: [
          {
            // The entry point for your main process.
            entry: 'main.js',
            config: 'vite.main.config.ts',
          },
          {
            entry: 'preload.js',
            config: 'vite.preload.config.ts',
          },
          {
            entry: 'help-preload.js',
            config: 'vite.preload.config.ts',
          },
        ],
        // `renderer` specifies the Vite dev server configurations for renderer processes.
        renderer: [
          {
            name: 'main_window',
            config: 'vite.config.ts',
          },
        ],
      },
    },
  ],
};