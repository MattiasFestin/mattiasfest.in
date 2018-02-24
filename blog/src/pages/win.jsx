import React, { Component } from "react";
import Helmet from "react-helmet";
import About from "../components/About/About";
import config from "../../data/SiteConfig";

import jszip from 'jszip';

// import Draggable from 'react-draggable';

import { Window, TopBar, Content, WindowManager } from '../components/Window/Window';

const iframe = {__html: `
	<iframe src="https://archive.org/embed/msdos_Commander_Keen_4_-_Secret_of_the_Oracle_1991" width="560" height="384" frameborder="0" webkitallowfullscreen="true" mozallowfullscreen="true" allowfullscreen></iframe>
`};

class AboutPage extends Component {
	render() {
		return (
			<div className="desktop" style={{width: '100%', height: '1000px', backgroundColor: 'hotpink'}}>
				<Window key='1'>
					<div dangerouslySetInnerHTML={iframe}></div>
				</Window>
				{/* <Window key='2' backgroundColor='#F00'>
					<span>Test 123</span>
				</Window>
				<Window key='3' backgroundColor='#0F0'>
					<span>Test 123</span>
				</Window>
				<Window key='4' backgroundColor='#00F'>
					<span>Test 123</span>
				</Window> */}
				{/* <Window key='2' backgroundColor='#F00'>
					<span>Test 123</span>
				</Window> */}
				{/* <Window>
						{/* <div>
							<TopBar></TopBar>
							<Content></Content>
						</div> 
				</Window> */}
			</div>
		);
	}
}

export default AboutPage;