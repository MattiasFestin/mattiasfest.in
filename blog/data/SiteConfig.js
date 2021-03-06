module.exports = {
  blogPostDir: "posts", // The name of directory that contains your posts.
  siteTitle: "mattiasfest.in", // Site title.
  siteTitleAlt: "A programming blog about programming", // Alternative site title for SEO.
  siteLogo: "/logos/logo-1024.png", // Logo used for SEO and manifest.
  siteUrl: "https://mattiasfest.in", // Domain of your website without pathPrefix.
  cdn: [
    'https://cdn01.mattiasfest.in',
    'https://cdn02.mattiasfest.in',
    'https://cdn03.mattiasfest.in',
    'https://cdn04.mattiasfest.in'
  ],
  pathPrefix: "/", // Prefixes all links. For cases when deployed to example.github.io/gatsby-material-starter/.
  fixedFooter: false, // Whether the footer component is fixed, i.e. always visible
  siteDescription: "A tech blog.", // Website description used for RSS feeds/meta description tag.
  siteRss: "/rss.xml", // Path to the RSS file.
  siteFBAppID: "1825356251115265", // FB Application ID for using app insights
  siteGATrackingID: "UA-35874527-1", // Tracking code ID for google analytics.
  disqusShortname: "mattiasfestinblog", // Disqus shortname.
  postDefaultCategoryID: "Tech", // Default category for posts.
  userName: "Mattias Festin", // Username to display in the author segment.
  userTwitter: "mattiasfestin", // Optionally renders "Follow Me" in the UserInfo segment.
  userLocation: "Kalix, Sweden", // User location to display in the author segment.
  userAvatar: "https://avatars3.githubusercontent.com/u/1441064?s=460&v=4", // User avatar to display in the author segment.
  userDescription:
    "I am a developer living in the north of Sweden. I like computers, mathematics, electronics and beer brewing. I like animals, and have one dog and two cats.", // User description to display in the author segment.
  // Links to social profiles/projects you want to display in the author segment/navigation bar.
  userLinks: [
    {
      label: "GitHub",
      url: "https://github.com/mattiasfestin",
      iconClassName: "fa fa-github"
    },
    {
      label: "Twitter",
      url: "https://twitter.com/mattiasfestin",
      iconClassName: "fa fa-twitter"
    },
    {
      label: "Email",
      url: "mailto:mail@mattiasfest.in",
      iconClassName: "fa fa-envelope"
    }
  ],
  copyright: "Copyright © 2017. Mattias Festin" // Copyright string for the footer of the website and RSS feed.
};
