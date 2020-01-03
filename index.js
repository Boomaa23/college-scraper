const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const ncesUrl = 'https://nces.ed.gov/collegenavigator/?id=110705';
const stateApiUrl = 'https://gist.githubusercontent.com/mshafrir/2646763/raw/8b0dbb93521f5d6889502305335104218454c2bf/states_titlecase.json';

var sheetData = [];
var json;

function main() {
	axios.get(stateApiUrl)
		.then(response => {
			json = JSON.parse(JSON.stringify(response.data));
		});
	axios.get(ncesUrl)
		.then(response => {
			const $ = cheerio.load(response.data);
			var generalInfo = $('.collegedash');
			var admissions = $('#admsns');
			
			var univNameLoc = generalInfo.find('div').find('span[style="position:relative"]');
			sheetData.push(univNameLoc.find('.headerlg').text()); //name
			const stateName = univNameLoc.text().substring(univNameLoc.text().lastIndexOf(', ') + 2, univNameLoc.text().lastIndexOf(' '));
			sheetData.push(univNameLoc.text().substring(univNameLoc.text().indexOf(', ') + 2, univNameLoc.text().lastIndexOf(', ') + 2) + getStateAbbv(stateName)); //location
			
			const rawPopulation = generalInfo.find('.layouttab').find('tbody').find('tr').eq(6).find('td').eq(1).text();
			sheetData.push(rawPopulation.substring(rawPopulation.lastIndexOf('(') + 1, rawPopulation.lastIndexOf(' u'))); //ug population
			
			sheetData.push(boolChooser(strSearch(generalInfo.text(), 'California'), 'Y', 'N')); //in-state
			sheetData.push(admissions.find('.tabular').eq(1).find('tbody').find('tr').eq(1).find('td').eq(1).text()); //admission rate
			
			const testScores = admissions.find('.tabular').eq(4).find('tbody').find('tr');
			sheetData.push(Math.round((getRowScoreAvg(testScores, 0) + getRowScoreAvg(testScores, 1)) / 10) * 10); //average sat
			sheetData.push(getRowScoreAvg(testScores, 2)); //average act
			
			sheetData.push(boolChooser(strSearch(generalInfo.text(), 'Public'), 'Public', 'Private')); //public/private
			
			sheetData.push(admissions.find('.tabular').find('tbody').find('td').eq(1).text()); //application fee

			console.log(sheetData);
		})
		.catch(error => {
			console.log(error);
		});
}
	
function strSearch(search, query) {
	return search.includes(query);
}

function boolChooser(bool, trueOpt, falseOpt) {
	if(bool) {
		return trueOpt;
	} else {
		return falseOpt;
	}
}

function getStateAbbv(state) {
	for(var i = 0;i < json.length;i++) {
		if(state.localeCompare(json[i]['name']) == 0) {
			return json[i]['abbreviation'];
		}
	}
}


function getRowScoreAvg(testScores, row) {
	return (parseInt(testScores.eq(row).find('td').eq(1).text()) + parseInt(testScores.eq(row).find('td').eq(2).text())) / 2;
}

main();