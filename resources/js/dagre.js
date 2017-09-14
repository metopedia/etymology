/*globals
    $, d3, console, dagreD3, Rx, window, document
*/
/*jshint loopfunc: true, shadow: true */ // Consider removing this and fixing these
var GRAPH = (function(module) {

    module.bindModule = function(base, moduleName) {
        var etyBase = base;

	var serverError = function(error) {
	    console.log(error);

	    $('#message')
                .css('display', 'inline')
                .html(etyBase.LOAD.MESSAGE.serverError);
	}

	var notAvailable = function(error) {
	    console.error(error);
            
	    $('#tree-overlay')
		.remove();
            d3.select("#tooltipPopup")
		.style("display", "none");
            $('#message')
		.css('display', 'inline')
		.html(etyBase.LOAD.MESSAGE.notAvailable);
	}


	var constructDisambiguationGraph = function(lemma) {
	    var url = etyBase.config.urls.ENDPOINT + "?query=" + encodeURIComponent(etyBase.DB.disambiguationQuery(lemma));
            if (etyBase.config.debug) {
                console.log("disambiguation query = " + url);
            }

            etyBase.DB.getXMLHttpRequest(url).subscribe(
                response => {
                    if (response !== undefined && response !== null) {
                        $('#tree-overlay')
                            .remove();
                        d3.select("#tooltipPopup")
                            .style("display", "none");

			var g = parseDisambiguationNodes(response);
                        if (null === g) {
                            $('#message')
                                .css('display', 'inline')
                                .html(etyBase.LOAD.MESSAGE.notAvailable);
                        } else {
                            if (Object.keys(g.nodess).length > 1) {
                                $('#helpPopup')
                                    .html(etyBase.LOAD.HELP.disambiguation);
                                $('#message')
                                    .css('display', 'inline')
                                    .html(etyBase.LOAD.MESSAGE.disambiguation);
                                renderGraph(g).selectAll("g.node")
                                    .on("click", function(d) {
                                        var iri = g.node(d).iri;
                                        constructEtymologyGraph(iri, 2);
                                    })
                            } else {
                                var iri = Object.keys(g.nodess)[0];
                                constructEtymologyGraph(iri, 2);
                            }
			}
		    }
		},
		error => notAvailable(error),
                () => console.log('done disambiguation'));
	};
		
        var parseDisambiguationNodes = function(response) {
            var disambiguationArray = JSON.parse(response).results.bindings;
	    if (disambiguationArray.length === 0) {
                return null;
            }

            var g = new dagreD3.graphlib.Graph().setGraph({});

            //define nodes 
            g.nodess = {};
            disambiguationArray.forEach(function(n) {
                n.et.value.split(",")
                    .forEach(function(element) {
                        if (element !== "") {
                            g.nodess[element] = new etyBase.LOAD.classes.Node(element, n.lemma.value);
                        } else {
                            g.nodess[n.iri.value] = new etyBase.LOAD.classes.Node(n.iri.value, n.lemma.value);
                        }
                    });
            });
            if (etyBase.config.debug) {
                console.log(g.nodess);
            }

            //add nodes and links to the graph
            var m = null;
            for (var n in g.nodess) {
                g.setNode(n, g.nodess[n], { labelStyle: "font-size: 3em" });
                if (null !== m) {
                    g.setEdge(n, m, { label: "", style: "stroke-width: 0" });
                }
                m = n;
            }

            return g;
        };


	var parseAncestors = function(response) {
	    var ancestorArray = JSON.parse(response).results.bindings
                .reduce(
		    (ancestors, a) => {
			ancestors.push(a.ancestor1.value);
			if (undefined !== a.ancestor2) {
                            ancestors.push(a.ancestor2.value);
			}
			return ancestors;
                    }, 
		    [])
		.filter(etyBase.helpers.onlyUnique);
	    
            console.log("ANCESTORS");
            console.log(ancestorArray);

	    return ancestorArray;
	};
	
	var parseDescendants = function(response) {
	    var descendantArray = response
		.reduce(
		    (descendants, d) => {
			return descendants.concat(JSON.parse(d).results.bindings.map(function(t) { return t.descendant1.value; }));
		    }, 
		    []);
	    return descendantArray;
	};

        var constructEtymologyGraph = function(iri, parameter) {
            //if parameter == 1 submit a short (but less detailed) query
            //if parameter == 2 submit a longer (but more detailed) query
            $('#message')
		.css('display', 'inline')
		.html(etyBase.LOAD.MESSAGE.loadingMore);
            d3.select("#tooltipPopup")
		.attr("display", "none");
            $('#tree-overlay')
		.remove();

	    //todo: use a different query for ancestors
	    var url = etyBase.config.urls.ENDPOINT + "?query=" + encodeURIComponent(etyBase.DB.ancestorQuery(iri, parameter));
	    if (etyBase.config.debug) {
		console.log(url);
            }
            etyBase.DB.getXMLHttpRequest(url)
		.subscribe(
                    ancestorResponse => {
			if (null === ancestorResponse) {
			    $('#message')
				.css('display', 'inline')
				.html(etyBase.LOAD.MESSAGE.serverError);
			    return;
			}
			
			$('#helpPopup').html(etyBase.LOAD.HELP.dagre);
			var ancestorArray = parseAncestors(ancestorResponse);
			etyBase.DB.slicedQuery(ancestorArray, etyBase.DB.descendantQuery, 8)
                            .subscribe( 
				descendantResponse => { 
				    var descendantArray = parseDescendants(descendantResponse);
				    etyBase.DB.slicedQuery(descendantArray, etyBase.DB.propertyQuery, 4)
					.subscribe(
					    propertyResponse => {
						var g = parseEtymologyNodes(ancestorArray, ancestorResponse, propertyResponse);
						if (null === g) {
						    $('#message')
							.css('display', 'inline')
							.html(etyBase.LOAD.MESSAGE.noEtymology);
						} else {
						    renderGraph(g);
						}
					    });
				},
				error => serverError(error),
				() => console.log('done descendants query'));
                    },
                    error => {
			if (parameter === 1) {
			    serverError(error);
			} else {
                            constructEtymologyGraph(iri, 1);
			}
                    },
                    () => console.log('done DAGRE' + parameter));
        };
	
        var parseEtymologyNodes = function(ancestors, ancestorResponse, propertyResponse) {
	    
	    var allArray = propertyResponse.reduce((all, a) => {
                return all.concat(JSON.parse(a).results.bindings);
            }, []);
            if (allArray.length === 0) {
		return null;
	    } else {
		var g = new dagreD3.graphlib.Graph().setGraph({ rankdir: 'LR' });
		
		//CONSTRUCTING NODES
		g.nodess = {};
		allArray.forEach(function(element) {
		    //save all nodes        
		    //define isAncestor
		    if (undefined !== element.s && undefined === g.nodess[element.s.value]) {
			g.nodess[element.s.value] = new etyBase.LOAD.classes.Node(element.s.value, element.sLabel.value);
		    }
		    if (undefined !== element.rel) {
			if (undefined === g.nodess[element.rel.value]) {
			    g.nodess[element.rel.value] = new etyBase.LOAD.classes.Node(element.rel.value, element.relLabel.value);
			}
			if (ancestors.indexOf(element.rel.value) > -1) {
			    g.nodess[element.rel.value].isAncestor = true;
			}
		    }
		    if (undefined !== element.rel && undefined !== element.eq) {
			if (undefined === g.nodess[element.eq.value]) {
			    g.nodess[element.eq.value] = new etyBase.LOAD.classes.Node(element.eq.value, element.eqLabel.value);
			}
			//push to eqIri
			if (g.nodess[element.rel.value].eqIri.indexOf(element.eq.value) == -1) {
			    g.nodess[element.rel.value].eqIri.push(element.eq.value);
			}
			if (g.nodess[element.eq.value].eqIri.indexOf(element.rel.value) == -1) {
			    g.nodess[element.eq.value].eqIri.push(element.rel.value);
			}
		    }
		});

		//CONSTRUCTING GRAPHNODES
		//a graphNode is some kind of super node that merges Nodes that are etymologically equivalent
		//or that refer to the same word - also called here identical Nodes 
		//(e.g.: if only ee_word and ee_n_word with n an integer belong to
		//the set of ancestors and descendants           
		//then merge them into one graphNode) 
		//the final graph will use these super nodes (graphNodes)  
		g.graphNodes = {};
		var counter = 0; //counts how many graphNodes have been created so far
		for (var n in g.nodess) {
                    if (g.nodess[n].ety === 0) {
			var iso = g.nodess[n].iso;
			var label = g.nodess[n].label;
			var tmp = [];
			for (var m in g.nodess) {
                            if (undefined !== g.nodess[m]) {
				if (g.nodess[m].iso === iso && g.nodess[m].label === label) {
                                    if (g.nodess[m].ety > 0) {
					tmp.push(m);
                                    }
				}
                            }
			}
			tmp = tmp.filter(etyBase.helpers.onlyUnique);
			//if only ee_word and ee_n_word with n an integer belong to
			//the set of ancestors and descendants
			//then merge them in one graphNode
			if (tmp.length === 1) {
                            var gg = new etyBase.LOAD.classes.GraphNode(counter);
                            //initialize graphNode.all 
                            gg.all.push(n);
                            //define graphNode.iri 
                            gg.iri = g.nodess[tmp[0]].eqIri;
                            gg.iri.push(tmp[0]);
                            //define node.graphNode
                            g.nodess[n].graphNode.push(counter);
                            g.nodess[tmp[0]].graphNode.push(counter);
                            gg.iri.forEach(function(element) {
				g.nodess[element].graphNode.push(counter);
                            });
			    
                            //push to graphNodes
                            g.graphNodes[counter] = gg;
                            g.graphNodes[counter].iri = g.graphNodes[counter].iri.filter(etyBase.helpers.onlyUnique);
                            counter++;
			}
                    }
		}
		
		for (var n in g.nodess) {
                    if (g.nodess[n].graphNode.length === 0) {
			//add iri
			var gg = new etyBase.LOAD.classes.GraphNode(counter);
			gg.iri = g.nodess[n].eqIri;
			gg.iri.push(n);
			var equivalent = gg.iri.reduce(function(a,b) {
			    return a.concat(b.eqIri);
			}, [])
			gg.iri.concat(equivalent); 
			gg.iri = gg.iri.filter(etyBase.helpers.onlyUnique);
			//add graphNode, graphNodes
			gg.iri.forEach(function(element) {
                            g.nodess[element].graphNode.push(counter);
			});
			g.graphNodes[counter] = gg;
			counter++;
                    } else {
			var graphNode = g.nodess[n].graphNode[0];
			
			g.nodess[n].eqIri.forEach(function(element) {
			    //add graphNode
			    if (element != n) {
				g.nodess[element].graphNode.push(graphNode);
			    }
			    //add iri
			    g.graphNodes[graphNode].iri = g.graphNodes[graphNode].iri.concat(g.nodess[element].eqIri).filter(etyBase.helpers.onlyUnique);
			});
                    }
		}
		
		//always show derived nodes if tree is small
		//if (ancestors.length < 3) etyBase.config.showDerivedNodes = true;
		for (var gg in g.graphNodes) {
                    //define all
                    g.graphNodes[gg].all = g.graphNodes[gg].all.concat(g.graphNodes[gg].iri);
		    
                    //define isAncestor
                    if (g.graphNodes[gg].all.filter(function(element) { return g.nodess[element].isAncestor; }).length > 0) {
			g.graphNodes[gg].all.forEach(function(element) { g.nodess[element].isAncestor = true; });
			g.graphNodes[gg].isAncestor = true;
                    }
		    
                    //define iso, label, lang
                    g.graphNodes[gg].iso = g.nodess[g.graphNodes[gg].all[0]].iso;
                    g.graphNodes[gg].label = g.graphNodes[gg].iri.map(function(i) { return g.nodess[i].label; }).join(",");
                    g.graphNodes[gg].lang = g.nodess[g.graphNodes[gg].all[0]].lang;

		    g.setNode(gg, g.graphNodes[gg]);
		}

		//CONSTRUCTING LINKS
		allArray.forEach(function(element) {
                    if (undefined !== element.rel && undefined !== element.s) {
			var source = g.nodess[element.rel.value].graphNode[0],
                        target = g.nodess[element.s.value].graphNode[0];
			if (source !== target) {
                            g.setEdge(source, target, { label: "", lineInterpolate: "basis" });
			}
                    }		    
		});

		//todo: add links between ancestors
		
		if (etyBase.config.debug) {
		    console.log("g.nodess");
		    console.log(g.nodess) ;  
		    console.log("g.graphNodes");
		    console.log(g.graphNodes);
		}
		
		$('#message')
                    .css('display', 'none');
		
		return g;
            }
	};

        var renderGraph = function(g) {
            var svg = d3.select("#tree-container").append("svg")
                .attr("id", "tree-overlay")
                .attr("width", window.innerWidth)
                .attr("height", window.innerHeight - $('#header').height());

            var inner = svg.append("g");

            // Set up zoom support                      
            var zoom = d3.behavior.zoom().on("zoom", function() {
                inner.attr("transform", "translate(" + d3.event.translate + ")" +
                    "scale(" + d3.event.scale + ")");
            });
            svg.call(zoom); //.on("dblclick.zoom", null);

            // Create the renderer          
            var render = new dagreD3.render();

            // Run the renderer. This is what draws the final graph.  
            render(inner, g);

            // Center the graph       
            var initialScale = 0.75;
            zoom.translate([(window.innerWidth - g.graph().width * initialScale) / 2, 20])
                .scale(initialScale)
                .event(svg);

	    //append language tag to nodes            
            inner.selectAll("g.node")
                .append("text")
                .style("width", "auto")
                .style("height", "auto")
                .style("display", "inline")
		.attr("class", "isoText")
                .attr("x", "1em")
                .attr("y", "3em")
		.html(function(d) {
                    return g.node(d).iso;
                });
	    
            //show tooltip on click on language tag   
            inner.selectAll("g.node")
                .append("rect")
		.attr("x", "0.8em")
                .attr("y", "2.2em")
                .attr("x", "0.8em")
		.attr("width", function(d) {
                    return g.node(d).iso.length / 1.7 + "em";
                })
                .attr("height", "1em")
                .attr("fill", "red")
                .attr("fill-opacity", 0)
                .on("mouseover", function(d) {
                    d3.select("#tooltipPopup")
                        .style("display", "inline")
                        .style("left", (d3.event.pageX) + "px")
                        .style("top", (d3.event.pageY - 28) + "px")
                        .html(g.node(d).lang);
                    d3.event.stopPropagation();
                });

            //show tooltip on click on nodes                
            inner.selectAll("g.node")
                .on("mouseover", function(d) {
                    d3.select("#tooltipPopup")
                        .style("display", "inline")
                        .style("left", (d3.event.pageX + 38) + "px")
                        .style("top", (d3.event.pageY - 28) + "px")
                        .html("");
                    var iri = g.node(d).iri;
                    if (typeof iri === "string") {
                        g.nodess[iri].logTooltip();
                    } else {
                        iri.forEach(
                            function(i) {
                                g.nodess[i].logTooltip();
                            });
                    }
                    d3.event.stopPropagation();
                });
	    
            //svg.attr("height", g.graph().height * initialScale + 40);}}
            return inner;
        };

        var init = function() {

            $('#helpPopup')
		.html(etyBase.LOAD.HELP.intro);

            var div = d3.select("body").append("div")
                .attr("data-role", "popup")
                .attr("data-dismissible", "true")
                .attr("id", "tooltipPopup")
                .style("display", "none")
                .attr("class", "ui-content tooltipDiv");

            $(window).click(function() {
                d3.select("#tooltipPopup")
                    .style("display", "none");
            });

            $('#tooltipPopup').click(function(event) {
                event.stopPropagation();
            });

            $('#tags').on("keypress click", function(e) {
                var tag = this;
                if (e.which === 13 || e.type === 'click') {
                    var lemma = $(tag).val();

                    if (lemma) {
                        var width = window.innerWidth,
                            height = $(document).height() - $('#header').height();
			constructDisambiguationGraph(lemma);
                    }
                }
            });


        };

        this.init = init;
        
        etyBase[moduleName] = this;
    };

    return module;

})(GRAPH || {});
