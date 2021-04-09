/* eslint-disable import/no-commonjs */
/* eslint-disable import/unambiguous */
module.exports = {
  title: 'GraphQL Tools',
  tagline: 'A set of utilities to build your GraphQL schema in a concise, faster and powerful way',
  url: 'https://graphql-tools.com',
  baseUrl: '/',
  favicon: 'img/favicon.ico',
  organizationName: 'ardatan', // Usually your GitHub org/user name.
  projectName: 'graphql-tools', // Usually your repo name.
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
    },
    navbar: {
      // title: 'GraphQL Tools',
      logo: {
        alt: 'GraphQL Tools Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          to: 'docs/introduction',
          activeBasePath: 'docs',
          label: 'API & Documentation',
          position: 'right',
        },
        {
          href: 'https://github.com/ardatan/graphql-tools',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://the-guild.dev/contact',
          label: 'Contact Us',
          position: 'right',
        },
      ],
    },
    algolia: {
      appId: 'ANRJKXZTRW',
      apiKey: '811d453fc7f80306044dd5cc4b87e064',
      indexName: 'theguild'
    },
    footer: {
      style: 'dark',
      links: [
        /* {
          title: 'Docs',
          items: [
            {
              label: 'Style Guide',
              to: 'docs/doc1'
            },
            {
              label: 'Second Doc',
              to: 'docs/doc2'
            }
          ]
        }, */
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'http://bit.ly/guild-chat',
            },
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/graphql-tools',
            },
          ],
        },
        {
          title: 'Social',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Urigo/graphql-tools/',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/TheGuildDev',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} The Guild, Inc. Built with Docusaurus.`,
    },
  },
  scripts: [
    {
      src: 'https://the-guild.dev/static/banner.js',
      async: true,
      defer: true,
    },
  ],
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/ardatan/graphql-tools/edit/master/website/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
};
