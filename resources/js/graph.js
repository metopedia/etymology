/*globals
  $, d3, console, dagreD3, Rx, window, document, URLSearchParams
*/
var GRAPH = (function(module) {
    
    module.bindModule = function(base, moduleName) {
	var etyBase = base; 

	class Node {
	    constructor(counter, etymologyEntry) {
		if (undefined !== counter) {
		    if (undefined === etymologyEntry) {
			this.iri = []; //array of iris 
			this.isAncestor = false; //bool
			this.id = undefined; //integer
			this.iso = undefined; //string
			this.label = undefined; //string
			this.lang = undefined; //string
		    } else {
			this.iri = [etymologyEntry.iri];
			this.isAncestor = etymologyEntry.isAncestor;
			this.id = counter;
			this.iso = etymologyEntry.iso;
			this.lang = etymologyEntry.lang;
			this.label = etymologyEntry.label;
		    }
		    this.posAndGloss = []; //array of objects 
		    this.urlAndLabel = []; //array of objects 
		    
		    this.rx = this.ry = 25; //integer   radius of a node 
		} else {
		    log.err("Wrong input parameters to Node constructor");
		}
	    }

//createElement(p), p.addclass
	    tooltip() {
		var labels = this.label.split(",");
		var toreturn = "";
		for (var i in labels) {
		    toreturn += "<b>" + 
			labels[i] + 
			"</b>" +
			"<br><br>" + 
			this.posAndGloss[i].map((t) => {
			    var pos = t.pos;
			    return t.gloss.map((gloss) => pos + " - " + gloss).join("<br><br>");
			}) + 
			"<br><br><br>" +
			"Data is under CC BY-SA and has been extracted from: " +
			this.urlAndLabel[i].map((t) => {
			    return etyBase.helpers.htmlLink(t.url, t.label);
			}) + 
			"<br><br>";
		}

		return toreturn;
	    }
	}
		
	class Dagre {
	    constructor() {
		//initialize dagre 
		this.dagre = new dagreD3.graphlib.Graph().setGraph({ rankdir: "TB" }); 
	    }

	    //draw this.dagre in the element selected by selector
	    //and call the svg element id
	    //fit dagre to screen 
            render(selector, id) {
                var that = this;
		
		var svg = d3.select(selector).append("svg")
                    .attr("id", id)
		    .attr("width", window.innerWidth)
		    .attr("height", window.innerHeight - $("#header").height());
                
                var inner = svg.append("g");
		
                // Set up zoom support                      
                var zoom = d3.behavior.zoom().on("zoom", function() {
                    inner.attr("transform", 
			       "translate(" +
			       d3.event.translate + 
			       ")" +
                               "scale(" + 
			       d3.event.scale + 
			       ")");
                });
                svg.call(zoom);
                
                // Create the renderer          
                var render = new dagreD3.render();
                
                // Run the renderer. This is what draws the final graph.  
                render(inner, that.dagre);
		
                // Center the graph
		var width = window.innerWidth;
		var graphWidth = that.dagre.graph().width;
		var zoomScale = (graphWidth > width) ? (0.8 * Math.max(width / graphWidth, 0.2)) : 0.75;
		
		zoom.translate([(window.innerWidth - that.dagre.graph().width * zoomScale) / 2, 20])
		    .scale(zoomScale)
		    .event(svg);
                
	        // Decorate graph
	        inner.selectAll("g.node > rect")
		    .attr("class", "word");
		
	        //show tooltip on mouseover graphNode
                inner.selectAll(".word")
                    .on("mouseover", function(d) {
		        d3.select(this).style("cursor", "pointer"); 
                        d3.selectAll(".tooltip").remove();
			d3.select("#tooltipPopup")
                            .style("display", "inline")
                            .style("left", (d3.event.pageX + 38) + "px")
                            .style("top", (d3.event.pageY - 28) + "px")
			    .append("p") 
			    .attr("class", "tooltip")
			    .html(that.dagre.node(d).tooltip());
//.append("p").html() 

                        d3.event.stopPropagation();
                    });
		
                //append language tag to nodes            
                inner.selectAll("g.node")
                    .append("text")
                    .style("display", "inline")
                    .attr("class", "isoText")
                    .attr("x", "1em")
                    .attr("y", "3em")
                    .html(function(d) {
                        return that.dagre.node(d).iso;
                    });
		
                //show tooltip on mouseover language tag   
                inner.selectAll("g.node")
                    .append("rect")
		    .attr("class", "isoRect")
		    .attr("x", "0.8em")
		    .attr("y", "2.2em")
                    .attr("width", function(d) {
                        return that.dagre.node(d).iso.length / 1.7 + "em";
                    })
		    .attr("height", "1em")
                    .on("mouseover", function(d) {
                        d3.selectAll(".tooltip").remove();
                        d3.select("#tooltipPopup")
                            .style("display", "inline")
                            .style("left", (d3.event.pageX) + "px")
                            .style("top", (d3.event.pageY - 28) + "px")
                            .append("p")
                            .attr("class", "tooltip")
                            .html(that.dagre.node(d).lang);
                        d3.event.stopPropagation();
                    });
		
		return inner;
            }

	    setLanguages() {
		for (var gn in this.nodes) {
		    var lang = this.nodes[gn].lang;
		    if (undefined !== lang) {
			this.languages.push(lang);
		    }
		}
		this.languages = this.languages
		    .filter(etyBase.helpers.onlyUnique);
	    }
	}

	class Graph extends Dagre {
            constructor(graph) {
                super();

                //initialize nodes                                                                                                                                                                    
                if (undefined === graph.nodes) {
                    console.err("Error: no arguments provided to Graph constructor");
                } else {
                    this.nodes = graph.nodes;
                    for (var n in this.nodes) {
                        this.dagre.setNode(n, this.nodes[n]);
                    }
                }

                //initialize edges                                                                                                                                                                    
                if (undefined === graph.edges) {
                    this.setEdges();
                    for (var e in this.edges) {
                        var source = this.edges[e].source,
                        target = this.edges[e].target;
                        this.dagre.setEdge(source, target, this.edges[e].style);
                    }
                } else {
                    this.edges = graph.edges;
                    for (var e in this.edges) {
                        var source = this.edges[e].source,
                        target = this.edges[e].target;
                        if (this.nodes[source].isAncestor && this.nodes[target].isAncestor) {
                            this.dagre.setEdge(source, target, this.edges[e].style);
                        }
                    }
                }
                //initialize languages                    
                this.languages = [];
            }


	    //given this.nodes and this.edges   
            //define this.dagre nodes and edges   
            //and assign this.edges[e].style to the edges  
            setEdges() {
                //group nodes by language and place them in columns of length 150 
                var m = null, col = 1;
                var nCol = Math.max(Math.floor(window.innerWidth/150), 2);

                for (var l in this.languages) {
                    for (var n in this.nodes) {
                        if (this.nodes[n].lang === this.languages[l]) {
                            if (m !== null) {
                                this.edges.push({
                                    source: m,
                                    target: n,
                                    style: {
                                        label: "",
                                        style: "stroke: none",
                                        lineInterpolate: "basis",
                                        arrowheadStyle: "fill: none"
                                    }
                                });
                                col += 1;
                            }
                            if (col === nCol) {
                                m = null;
                                col = 1;
                            } else {
                                m = n;
                            }
                        }
                    }
                }
            }
	}

	class LanguageGraph extends Dagre {
	    constructor(g, language) {
		super()

		//define nodes
		var counter = 0;
		this.nodes = {};
                for (var i in g.nodes) {
                    if (g.nodes[i].lang === language) {
			this.nodes[counter] = g.nodes[i];
			counter ++;
                    }
                }

		for (var n in this.nodes) {
		    this.dagre.setNode(n, this.nodes[n]);
		}

		//define edges
		for (var e in this.edges) {
		    var source = this.edges[e].source, 
		    target = this.edges[e].target;
		    this.dagre.setEdge(source, target, this.edges[e].style);
		}
            }
	}
		
	this.Node = Node;
	this.Graph = Graph;
	this.LanguageGraph = LanguageGraph;
        etyBase[moduleName] = this;
    };

    return module;
})(GRAPH || {});