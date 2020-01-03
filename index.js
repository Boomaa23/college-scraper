const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const {google} = require('googleapis');
const readline = require('readline');

var allData = [];
var schoolIds = [];
var json;
var sheets;
var startRow = 2;

const ncesUrl = 'https://nces.ed.gov/collegenavigator/?id=';
const stateApiUrl = 'https://gist.githubusercontent.com/mshafrir/2646763/raw/8b0dbb93521f5d6889502305335104218454c2bf/states_titlecase.json';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';
const SPREADSHEET_ID = '1s-DiDo9CKsd1D2ohyJT19-uj2lxt9r4cDLcyXki-fkc';

function authSheets(auth) {
	sheets = google.sheets({version: 'v4', auth});
	getSchoolIds();
}

function main() {
	fs.readFile('credentials.json', (err, content) => {
		if (err) return console.log('Error loading client secret file:', err);
		authorize(JSON.parse(content), authSheets);
	});
}

function getSchoolIds() {
	sheets.spreadsheets.values.get({
		spreadsheetId: SPREADSHEET_ID,
		range: 'Sheet1!O2:O',
		majorDimension: "COLUMNS",
	},
	function(err, response) {
    schoolIds = response['data']['values'][0];
		console.log(schoolIds);
		for(var i = 0;i < schoolIds.length;i++) {
			scrape(schoolIds[i], i);
		}
  });
}

function scrape(schoolId, index) {
	axios.get(stateApiUrl)
		.then(response => {
			json = JSON.parse(JSON.stringify(response.data));
		});
	axios.get(ncesUrl + schoolId)
		.then(response => {
			const $ = cheerio.load(response.data);
			var generalInfo = $('.collegedash');
			var admissions = $('#admsns');
			var expenses = $('#expenses');
			
			var sheetData = [];
			
			var univNameLoc = generalInfo.find('div').find('span[style="position:relative"]');
			sheetData.push(univNameLoc.find('.headerlg').text()); //name
			
			const stateName = univNameLoc.text().substring(univNameLoc.text().lastIndexOf(', ') + 2, univNameLoc.text().lastIndexOf(' '));
			sheetData.push(univNameLoc.text().substring(univNameLoc.text().indexOf(', ') + 2, univNameLoc.text().lastIndexOf(', ') + 2) + getStateAbbv(stateName)); //location
			
			const rawPopulation = generalInfo.find('.layouttab').find('tbody').find('tr').eq(6).find('td').eq(1).text();
			sheetData.push(rawPopulation.substring(rawPopulation.lastIndexOf('(') + 1, rawPopulation.lastIndexOf(' u'))); //ug population
			
			const inState = strSearch(generalInfo.text(), 'California');
			
			const costRows = expenses.find('.tabular').eq(0).find('tbody').find('tr');
			var ocRows = [];
			costRows.each(function(i, elem) {
				if($(this).find('td').eq(0).text().includes('On Campus')) {
					ocRows.push(i);
				}
			});
			var costRow = ocRows.length - 1;
			if(inState && ocRows.length > 2) { costRow--; }
			sheetData.push(costRows.eq(ocRows[costRow]).find('td').eq(4).text()); //sticker price
			
			var tCostRow = 0;
			if(expenses.text().includes('In-state')) {
				if(inState) { tCostRow = 1; } else { tCostRow = 2; }
			}
			sheetData.push(getCostValue(expenses, tCostRow)); //tuition
			
			sheetData.push(boolChooser(inState, 'Y', 'N')); //in-state
			
			sheetData.push(admissions.find('.tabular').eq(1).find('tbody').find('tr').eq(1).find('td').eq(1).text()); //admission rate
			
			sheetData.push(""); //avg gpa filler
			const testScores = admissions.find('.tabular').eq(4).find('tbody').find('tr');
			sheetData.push(Math.round((getRowScoreAvg(testScores, 0) + getRowScoreAvg(testScores, 1)) / 10) * 10); //average sat
			sheetData.push(Math.round(getRowScoreAvg(testScores, 2))); //average act
			
			sheetData.push(boolChooser(strSearch(generalInfo.text(), 'Public'), 'Public', 'Private')); //public/private
			
			sheetData.push(admissions.find('.tabular').find('tbody').find('td').eq(1).text()); //application fee
			
			console.log(sheetData);
			allData.push(sheetData);
			appendData(sheetData, index + startRow);
		})
		.catch(error => {
			console.log(error);
		});
}

function appendData(sheetData, row) {
  sheets.spreadsheets.values.update({
		spreadsheetId: SPREADSHEET_ID,
		range: 'Sheet1!A' + row + ':L' + row,
		valueInputOption: 'RAW',
		resource: {
			values: [sheetData]
		}
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

function getCostValue(base, row) {
	return base.find('.tabular').eq(0).find('tbody').find('tr').eq(row).find('td').eq(4).text();
}

function authorize(credentials, callback) {
	const {client_secret, client_id, redirect_uris} = credentials.installed;
	const oAuth2Client = new google.auth.OAuth2(
			client_id, client_secret, redirect_uris[0]);

	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getAccessToken(oAuth2Client, callback);
		oAuth2Client.setCredentials(JSON.parse(token));
		callback(oAuth2Client);
	});
}

function getAccessToken(oAuth2Client, callback) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	});
	console.log('Authorize this app by visiting this url:', authUrl);
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	rl.question('Enter the code from that page here: ', (code) => {
		rl.close();
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error('Error retrieving access token', err);
			oAuth2Client.setCredentials(token);
			fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
				if (err) return console.error(err);
				console.log('Token stored to', TOKEN_PATH);
			});
			callback(oAuth2Client);
		});
	});
}

main();