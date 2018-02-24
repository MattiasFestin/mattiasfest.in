import React, { Component } from "react";
import Helmet from "react-helmet";
import About from "../components/About/About";
import config from "../../data/SiteConfig";

// import Draggable from 'react-draggable';

import Window from '../components/Window/Window';

class AboutPage extends Component {
  render() {
    return (
      <div className="about-container">
        <Helmet>
          <title>{`About | ${config.siteTitle}`}</title>
          <link rel="canonical" href={`${config.siteUrl}/about/`} />
        </Helmet>
          <About />
      </div>
    );
  }
}

export default AboutPage;
