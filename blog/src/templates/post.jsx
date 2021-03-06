import React from "react";
import Helmet from "react-helmet";
import Card from "react-md/lib/Cards";
import CardText from "react-md/lib/Cards/CardText";
import UserInfo from "../components/UserInfo/UserInfo";
import Disqus from "../components/Disqus/Disqus";
import PostTags from "../components/PostTags/PostTags";
import PostCover from "../components/PostCover/PostCover";
import PostInfo from "../components/PostInfo/PostInfo";
import SocialLinks from "../components/SocialLinks/SocialLinks";
import PostSuggestions from "../components/PostSuggestions/PostSuggestions";
import SEO from "../components/SEO/SEO";
import LiveCodeEditor from "../components/LiveCodeEditor/LiveCodeEditor";
import config from "../../data/SiteConfig";
import "./b16-tomorrow-dark.css";
import "./post.scss";

// import Prism from 'prismjs';
// import 'prismjs/themes/prism-okaidia.css';
// import 'prismjs/components/prism-typescript.min.js';

export default class PostTemplate extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			mobile: true
		};
		this.handleResize = this.handleResize.bind(this);
	}
	componentDidMount() {
		this.handleResize();
		window.addEventListener("resize", this.handleResize);

		this.initDependencies();
	}

	componentWillUnmount() {
		window.removeEventListener("resize", this.handleResize);
	}

	initDependencies() {
		if (typeof window !== 'undefined' && typeof window.MathJax === 'object' && window.MathJax.Hub && typeof window.MathJax.Hub.Queue === 'function') {
			window.MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
		}

		if (typeof window !== 'undefined' && typeof window.addthis === 'object' && window.addthis.layers && typeof window.addthis.layers.refresh === 'function') {
			window.addthis.layers.refresh();
		}

		// window.Prism.highlightAll();
		// window.klipse.plugin.init(klipse.run.plugin_prod.plugin.settings());
	}

	componentDidUpdate() {
		this.initDependencies();
	}

	handleResize() {
		if (window.innerWidth >= 640) {
			this.setState({ mobile: false });
		} else {
			this.setState({ mobile: true });
		}
	}

	render() {
		const { mobile } = this.state;
		const { slug } = this.props.pathContext;
		const expanded = !mobile;
		const postOverlapClass = mobile ? "post-overlap-mobile" : "post-overlap";
		const postNode = this.props.data.markdownRemark;
		const post = postNode.frontmatter;
		if (!post.id) {
			post.id = slug;
		}
		if (!post.category_id) {
			post.category_id = config.postDefaultCategoryID;
		}
		return (
			<div className="post-page md-grid md-grid--no-spacing">
				<Helmet>
					<title>{`${post.title} | ${config.siteTitle}`}</title>
					<link rel="canonical" href={`${config.siteUrl}${post.id}`} />
				</Helmet>
				<SEO postPath={slug} postNode={postNode} postSEO />
				<PostCover postNode={postNode} mobile={mobile} />
				<div
					className={`md-grid md-cell--9 post-page-contents mobile-fix ${postOverlapClass}`}
				>
					<Card className="md-grid md-cell md-cell--12 post">
						<CardText className="post-body">
							<h1 className="md-display-2 post-header">{post.title}</h1>
							<PostInfo postNode={postNode} />
							<div dangerouslySetInnerHTML={{ __html: postNode.html }} />
						</CardText>
						<div className="post-meta">
							<PostTags className="post-tags" tags={post.tags} />
							{/* <SocialLinks
								postPath={slug}
								postNode={postNode}
								mobile={this.state.mobile}
							/> */}
						</div>
						<LiveCodeEditor src="123" lang="js" />
					</Card>
					<div className="addthis_inline_share_toolbox" data-url={ config.siteUrl + post.slug } data-title={ post.title }></div>
					<Disqus postNode={postNode} expanded={expanded} />
					<UserInfo
						className="md-grid md-cell md-cell--12"
						config={config}
						expanded={expanded}
					/>
				</div>

				<PostSuggestions postNode={postNode} />
			</div>
		);
	}
}

/* eslint no-undef: "off"*/
export const pageQuery = graphql`
	query BlogPostBySlug($slug: String!) {
		markdownRemark(fields: { slug: { eq: $slug } }) {
			html
			timeToRead
			excerpt
			frontmatter {
				title
				cover
				date
				category
				tags
			}
			fields {
				nextTitle
				nextSlug
				prevTitle
				prevSlug
				slug
			}
		}
	}
`;
