const config = require("./data/SiteConfig");

const { fixedEl } = require('./src/rnd.js');

const pathPrefix = config.pathPrefix === "/" ? "" : config.pathPrefix;

module.exports = {
  pathPrefix: config.pathPrefix,
  siteMetadata: {
    siteUrl: config.siteUrl + pathPrefix,
    rssMetadata: {
      site_url: config.siteUrl + pathPrefix,
      feed_url: config.siteUrl + pathPrefix + config.siteRss,
      title: config.siteTitle,
      description: config.siteDescription,
      image_url: `${fixedEl('/logos/logo-512.png', config.cdn) + pathPrefix}/logos/logo-512.png`,
      author: config.userName,
      copyright: config.copyright
    }
  },
  plugins: [
    "gatsby-plugin-react-helmet",
    "gatsby-plugin-sass",
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "posts",
        path: `${__dirname}/content/${config.blogPostDir}`
      }
    },
    {
      resolve: "gatsby-transformer-remark",
      options: {
        plugins: [
          {
            resolve: "gatsby-remark-images",
            options: {
              maxWidth: 1200
            }
          },
          {
            resolve: "gatsby-remark-responsive-iframe"
          },
          "gatsby-remark-prismjs",
          "gatsby-remark-copy-linked-files",
          "gatsby-remark-autolink-headers"
        ]
      }
    },
    {
      resolve: "gatsby-plugin-google-analytics",
      options: {
        trackingId: config.siteGATrackingID
      }
    },
    {
      resolve: "gatsby-plugin-nprogress",
      options: {
        color: "#c62828"
      }
    },
    "gatsby-plugin-sharp",
    "gatsby-plugin-catch-links",
    "gatsby-plugin-twitter",
    "gatsby-plugin-sitemap",
    {
      resolve: "gatsby-plugin-manifest",
      options: {
        name: config.siteTitle,
        short_name: config.siteTitle,
        description: config.siteDescription,
        start_url: config.pathPrefix,
        background_color: "#e0e0e0",
        theme_color: "#c62828",
        display: "minimal-ui",
        icons: [
          {
            src: "/logos/logo-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/logos/logo-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    },
    "gatsby-plugin-offline",
    {
      resolve: "gatsby-plugin-feed",
      options: {
        setup(ref) {
          const ret = ref.query.site.siteMetadata.rssMetadata;
          ret.allMarkdownRemark = ref.query.allMarkdownRemark;
          ret.generator = "GatsbyJS Material Starter";
          return ret;
        },
        query: `
        {
          site {
            siteMetadata {
              rssMetadata {
                site_url
                feed_url
                title
                description
                image_url
                author
                copyright
              }
            }
          }
        }
      `,
        feeds: [
          {
            serialize(ctx) {
              const rssMetadata = ctx.query.site.siteMetadata.rssMetadata;
              return ctx.query.allMarkdownRemark.edges.map(edge => ({
                categories: edge.node.frontmatter.tags,
                date: edge.node.frontmatter.date,
                title: edge.node.frontmatter.title,
                description: edge.node.excerpt,
                author: rssMetadata.author,
                url: rssMetadata.site_url + edge.node.fields.slug,
                guid: rssMetadata.site_url + edge.node.fields.slug,
                custom_elements: [{ "content:encoded": edge.node.html }]
              }));
            },
            query: `
            {
              allMarkdownRemark(
                limit: 1000,
                sort: { order: DESC, fields: [frontmatter___date] },
              ) {
                edges {
                  node {
                    excerpt
                    html
                    timeToRead
                    fields { slug }
                    frontmatter {
                      title
                      cover
                      date
                      category
                      tags
                    }
                  }
                }
              }
            }
          `,
            output: config.siteRss
          }
        ]
      }
    }, {
      resolve: `gatsby-plugin-netlify`,
      options: {
        headers: {
          '/manifest.json': [
            'Cache-Control: public, must-revalidate, max-age=86400, s-maxage=86400'
          ],
          '/*.js': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.css': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.woff2': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.png': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.jpg': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.jpeg': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.webp': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ],
          '/*.gif': [
            'Cache-Control: public, immutable, max-age=1036800, s-maxage=1036800'
          ]
        },
        // option to add more headers. `Link` headers are transformed by the below criteria
        allPageHeaders: [
          'Cache-Control: public, no-cache, must-revalidate, max-age=1036800, s-maxage=1036800',
          `X-Frame-Options: deny`,
          `X-XSS-Protection: 1; mode=block`,
          `Strict-Transport-Security:max-age=31536000`,
          `includeSubDomains; preload`,
          `X-Content-Type:nosniff`,
          `Content-Security-Policy: block-all-mixed-content; default-src 'self' mattiasfest.in *.mattiasfest.in; script-src  data: blob: 'self' 'unsafe-inline' 'unsafe-eval' www.google-analytics.com *.addthisedge.com platform.twitter.com *.addthis.com cdnjs.cloudflare.com mattiasfestinblog.disqus.com graph.facebook.com; img-src * data: blob:; style-src 'self' 'unsafe-inline' fonts.googleapis.com mattiasfest.in *.mattiasfest.in; font-src *; object-src 'none'; frame-src *.addthis.com *.twitter.com archive.org`,
          `Referrer-Policy: no-referrer`,
          `Last-Modified: ${(new Date()).toUTCString()}`
        ], // option to add headers for all pages. `Link` headers are transformed by the below criteria
        mergeSecurityHeaders: true, // boolean to turn off the default security headers
        mergeLinkHeaders: true, // boolean to turn off the default gatsby js headers
        mergeCachingHeaders: true, // boolean to turn off the default caching headers
        transformHeaders: (headers, path) => headers, // optional transform for manipulating headers under each path (e.g.sorting), etc.
        generateMatchPathRewrites: true, // boolean to turn off automatic creation of redirect rules for client only paths
      }
    }
  ]
};
