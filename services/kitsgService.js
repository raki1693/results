const axios = require('axios');
const qs = require('qs');

class KitsgService {
    constructor() {
        this.baseUrl = 'https://kitsg.beessoftware.cloud';
        this.session = null;
        this.username = 'KITSG2023TE007';
        this.password = 'BHANUSRI1234';
    }

    async login() {
        try {
            // Step 1: Get initial cookies
            const initialResponse = await axios.get(`${this.baseUrl}/CloudilyaUnited`);
            let cookies = initialResponse.headers['set-cookie'] || [];

            // Step 2: Perform Login
            // This is a simplified login flow. In some cases, we need to extract __RequestVerificationToken
            const loginData = qs.stringify({
                UserName: this.username,
                Password: this.password,
                RememberMe: 'false'
            });

            const loginResponse = await axios.post(`${this.baseUrl}/Account/Login`, loginData, {
                headers: {
                    'Cookie': cookies.join('; '),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });

            if (loginResponse.headers['set-cookie']) {
                cookies = [...cookies, ...loginResponse.headers['set-cookie']];
            }

            this.session = cookies.join('; ');
            console.log('✅ KITSG Service Logged In Successfully');
            return true;
        } catch (error) {
            console.error('❌ KITSG Login Failed:', error.message);
            return false;
        }
    }

    async getStudentReport(params) {
        if (!this.session) await this.login();

        try {
            const data = qs.stringify({
                reportId: '4231',
                procedurename: 'ADMIN_SearchStudentsReport',
                reportPath: 'AdminSearchStudents',
                FormatName: params.format || 'PDF',
                'parameters[Batch]': params.batch || '2022 - 2023',
                'parameters[Regulationid]': params.regulationId || '1',
                'parameters[ProgramId]': params.programId || '1',
                'parameters[BranchId]': params.branchId || '8',
                'parameters[Flag]': params.status || 'Active',
                'parameters[ReportType]': params.reportType || 'Summary'
            });

            const response = await axios.post(`${this.baseUrl}/Reports/ReportsV3/GenerateReport`, data, {
                headers: {
                    'Cookie': this.session,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                responseType: 'arraybuffer'
            });

            return response.data;
        } catch (error) {
            console.error('❌ Error fetching KITSG Report:', error.message);
            throw error;
        }
    }

    // This method will be used for EDIT / DELETE once we confirm the exact endpoints
    async performAction(endpoint, payload) {
        if (!this.session) await this.login();
        
        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, payload, {
                headers: {
                    'Cookie': this.session,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ KITSG Action Failed [${endpoint}]:`, error.message);
            throw error;
        }
    }
}

module.exports = new KitsgService();
