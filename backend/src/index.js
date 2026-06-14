const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/auth',        require('./routes/auth'))
app.use('/api/groups',      require('./routes/groups'))
app.use('/api/expenses',    require('./routes/expenses'))
app.use('/api/settlements', require('./routes/settlements'))
app.use('/api/import',      require('./routes/import'))

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Splitwise backend running on port ${PORT}`))
