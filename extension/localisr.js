// Regular expressions
var r = {
	// RegExp objects
	regexp: {
		time: {},
		price: {}
	},
	// String versions
	string: {
		time: {},
		price: {}
	}
};

var ignoredElements = ['iframe', 'style', 'script'];

// Arguments:
//   - node: A HTML DOM node
// Returns: true if the node is an element node and should not be ignored
var shouldParse = function(node){
	return node.nodeType === 1 && ignoredElements.indexOf(node.nodeName.toLowerCase()) === -1;
};

// Returns: A new object with the keys and values of the input object swapped
var invert = function(obj){
	var new_obj = {};

	for (var prop in obj){
		if(obj.hasOwnProperty(prop)){
			new_obj[obj[prop]] = prop;
		}
	}

	return new_obj;
};

// Arguments:
//   - array: An array of strings to match
// Returns: A string that can be use to construct a RegExp that matches exactly one of the items in `array`
var matchOneRegex = function(array){
	return '(' + array.join('|') + '){1}';
};

// The CSS styles for the boxes that show the original value on mouseover
var hoverStyle = {
	position: 'absolute',
	left: 0,
	background: '#eee',
	border: '1px solid #222',
	padding: '5px',
	display: 'none',
	zIndex: 9999
};

// Creates an html string to replace a converted value with
// Arguments:
//   - oldValue: The string that will be replaced eg. "£100"
//   - newValue: The converted form of oldValue eg. "$130"
//   - type: A string describing the type of value being converted eg. "price"
// Returns: A string of html containing the markup for the replacement value and the popup to display the original value
var generateReplacement = function(oldValue, newValue, type){
	var hover = $('<span>')
		.addClass('converted-value-hover')
		.css(hoverStyle)
		.text('Original ' + type + ': ' + oldValue);

	var wrapper = $('<span>')
		.text(newValue)
		.addClass('converted-value')
		.css('position', 'relative')
		.append(hover);

	return $('<div>').html(wrapper).html();
};

r.string.time.separators = '(' + [':'].join('|') + '){1}';
r.regexp.time.separators = new RegExp(r.string.time.separators);

var targetTimezone;

var setupTimes = function(acronyms){
	r.string.time.timezones = '(' + acronyms.join('|') + '){1}';
	r.string.time.time = "[0-9]{1,2}" + // One or two digits
		"(\\s*" + r.string.time.separators + "\\s*[0-9]{2}\\s*)?" + // All or none of: one separator then two digits, optionally separated by whitespace
		"(\\s*am|pm)?\\s*" + // Optional AM/PM
		r.string.time.timezones; // One of the timezone acronyms

	r.regexp.time.timezones = new RegExp(r.string.time.timezones, 'gi');
	r.regexp.time.matcher = new RegExp(r.string.time.time, 'gi');
};

var parseTimeWithMinutes = function(string, zone, separator){
	separator = separator || ':';
	var format, offset;

	offset = zoneToOffsetString(zone);

	if(string.match(/am|pm/i)){
		format = 'h' + separator + 'mm a';
	}
	else{
		format = 'H' + separator + 'mm';
	}

	return convertTimeString(string, offset, format);
};

var parseTime = function(string, zone){
	var format, offset;

	offset = zoneToOffsetString(zone);

	if(string.match(/am|pm/i)){
		format = 'ha';
	}
	else{
		format = 'H';
	}

	return convertTimeString(string, offset, format);
};

// Convert a time string to the user's target time
// Arguments:
//   - string: The time string parsed from the webpage eg. "10:32 am GMT"
//   - offset: An offset string eg. "+0500"
//   - format: The format of the time string eg. "HH mm"
var convertTimeString = function(string, offset, format){
	var parse = string.substring(0, string.length - 4) + offset;
	var time = moment(parse, format + ' Z');
	return time.format(format) + ' ' + targetTimezone;
};

// Convert a zone to an offset string
// Arguments:
//   - zone: A three letter acronym representing the timezone of the time being converted
// Returns: A string representing the difference between the offset of `zone` and the user's target timezone
var zoneToOffsetString = function(zone){
	var offsetInputTime = timezones[zone.toUpperCase()];
	var offsetTargetTime = timezones[targetTimezone];

	return offsetToString(offsetInputTime.offset - offsetTargetTime.offset);
};

var targetCurrency, targetSymbol, currencyAcronyms;

var symbols = ['£', '€', '¥', '$'];
var currencies = [];

money.base = 'USD';

var setupCurrencies = function(acronyms){
	var i = 0;
	currencyAcronyms = acronyms;
	// Set up currencies list using acronyms and symbols.
	for(i = 0; i < acronyms.length; i++){
		currencies.push(acronyms[i]);
	}
	for(i = 0; i < symbols.length; i++){
		var symbol = symbols[i];
		// "$" is a metacharacter in regular expressions, so escape it
		if(symbol === '$'){
			symbol = '\\$';
		}
		currencies.push(symbol);
	}

	r.string.price.price = "[0-9]+\\.?([0-9]{2})?";

	r.string.price.currencies = matchOneRegex(currencies);
	r.string.price.symbols = matchOneRegex(symbols);
	r.string.price.acronyms = matchOneRegex(acronyms);

	r.string.price.matchers = [
		r.string.price.currencies + "\\s*" + r.string.price.price,
		r.string.price.symbols + "\\s*" + r.string.price.price + "\\s*" + r.string.price.acronyms
	];

	// Regex used for determining whether there is a price in a string
	r.regexp.price.matchers = [
		new RegExp(r.string.price.matchers[0], 'gi'),
		new RegExp(r.string.price.matchers[1], 'gi')
	];
	r.regexp.price.currencies = new RegExp(r.string.price.currencies, 'gi');
};

var symbolMap = {
	'£': 'GBP',
	'$': 'USD',
	'€': 'EUR',
	'¥': 'JPY'
};

var acronymMap = invert(symbolMap);


// Arguments:
//   - string: A string representing a foreign price, eg. £123.45
//   - currency: A string representing a currency, either a symbol like £ or a three letter acronym like GBP
// Returns: A string representing the price in the user's target currency.
var convertPrice = function(string, currency){
	var acronym;
	// Convert symbol to acronym if that was what was passed
	if(currencyAcronyms.indexOf(currency) !== -1){
		acronym = currency;
	}
	else if(symbols.indexOf(currency) !== -1){
		acronym = symbolMap[currency];
	}
	else{
		throw new Error("Invalid currency string: " + currency);
	}

	var price = accounting.unformat(string);
	var newPrice = money.convert(price, {from: acronym, to: targetCurrency});
	var newPriceString = accounting.formatMoney(newPrice, targetSymbol, 2);

	return newPriceString;
};

var converters = [
	// Price converter
	function(text, matches){
		for(var i = 0; i < matches.length; i++){
			var oldPrice = matches[i];
			if(oldPrice){
				var currency = oldPrice.match(r.regexp.price.currencies)[0].toUpperCase();

				// Don't convert prices that are already in the user's target currency
				if(currency === targetCurrency || currency === targetSymbol){ continue; }

				// Convert them to the user's currency
				var newPrice = convertPrice(oldPrice, currency);

				// Replace the old price string with the new one
				text = text.replace(oldPrice, generateReplacement(oldPrice, newPrice, 'price'));
			}
		}

		return text;
	},

	// Time converter
	function(text, matches){
		// Loop through the array of matched times to convert them
		for(var i = 0; i < matches.length; i++){
			// Store the original time
			var oldTime = matches[i];

			// string.match() sometimes returns empty strings or undefined, so ignore these
			if(oldTime){
				// Extract just the timezone acronym from the time string
				var timezone = oldTime.match(r.regexp.time.timezones)[0].toUpperCase();
				// Don't convert times that are already in the user's target timezone
				if(timezone === targetTimezone){ continue; }

				var newTime;
				// If the time string matched the regex and has a separator character in it, it must also have minutes
				if(oldTime.match(r.regexp.time.separators)){
					newTime = parseTimeWithMinutes(oldTime, timezone);
				}
				// Otherwise it's just got hours
				else{
					newTime = parseTime(oldTime, timezone);
				}

				// Don't perform the replacement if the conversion failed
				if(newTime !== null){
					// Replace the current occurence of a time in the text node with a html string replacement for the converted time and popup box
					text = text.replace(oldTime, generateReplacement(oldTime, newTime, 'time'));
				}
			}
		}

		return text;
	}
];

// Converts any price and time strings in any text nodes in the element, then recursively converts any child elements
var convert = function(element){
	$(element).contents().each(function(index){
		if(this.nodeType === 3){
			// The node is a text node so it can be parsed for currencies
			var text = this.textContent;
			var oldText = text;

			for(var i = 0; i < 2; i++){
				var matchers = [r.regexp.price.matchers, [r.regexp.time.matcher]][i];
				for(var j = 0; j < matchers.length; j++){
					var matcher = matchers[j];
					// Get an array of every substring in the current text node that is a valid price or time
					var matches = text.match(matcher);

					// If there are any matches
					if(matches){
						text = converters[i](text, matches);
					}
				}

			}

			// If any replacements have been made, replace the text node with a span element containing the converted text
			if(text !== oldText){
				var replacement = $('<span>')
					.attr('data-original-text', oldText)
					.html(text);

				$(this).replaceWith(replacement);
			}
		}

		else if(shouldParse(this)){
			// The node is an element node so recursively scan it for more text nodes
			convert(this);
		}
	});
};


// Recursively restores an element and all its children to previous values after conversion
var restore = function(element){
	// Loop through all child nodes of the element
	$(element).contents().each(function(index){
		var nodeName = this.nodeName.toLowerCase();
		if(shouldParse(this)){

			// If the node is a span node
			if(nodeName === 'span'){
				var t = $(this);
				var originalText = t.attr('data-original-text');

				// and is a converted time or price
				if(originalText){
					// Replace the span node with a text node contaning the original text from before the conversion
					var replacement = document.createTextNode(originalText);
					t.replaceWith(replacement);
					return;
				}
			}

			// Otherwise call recursively to restore any children of this node to their original state
			restore(this);
		}
	});
};

var init = function(){
	setupCurrencies(arrayOfKeys(money.rates));
	setupTimes(arrayOfKeys(timezones));

	// If the user's target currency has a symbol then use it, otherwise use the acronym as the symbol
	targetSymbol = acronymMap[targetCurrency] || targetCurrency + ' ';

	// Convert all the times and prices on the page
	convert('body');

	// Bind the mouse events for the 'original value' popups
	$('.converted-value')
		.on('mouseenter', function(){
			$(this).find('.converted-value-hover').show();
		})
		.on('mouseout', function(){
			$(this).find('.converted-value-hover').hide();
		});

	// Set the position of the popups
	$('.converted-value-hover').each(function(){
		var t = $(this);
		t.css('bottom', -(t.height() + 10));
	});
};

// Triggered when a message is sent from the background script containing the data needed to convert the page
chrome.extension.onMessage.addListener(
	function(request, sender, sendResponse){
		if(request.method === 'run'){
			// If the page is in a converted state then restore the original
			if(request.isConverted){
				restore('body');
			}
			// Otherwise convert it
			else {
				money.rates = request.rates;
				targetCurrency = request.currency || 'AED';
				targetTimezone = request.timezone || 'UTC';
				timezones = request.timezones;

				init();
			}
		}
	}
);

// Check if the current page's URL matches the user's list of URLs on which the extension should automatically run
chrome.extension.sendMessage({method: 'getAutoRunURLs'}, function(urls){
	if(!urls){ return; }
	urls = urls.split('\n');

	for(var i = 0; i < urls.length; i++){
		var url = urls[i];
		// If it matches, send a request to the background script to pass the necessary data to convert the page
		if(url && window.location.href.match(new RegExp(url))){
			chrome.extension.sendMessage({method: 'runScript'});
			return;
		}
	}
});

