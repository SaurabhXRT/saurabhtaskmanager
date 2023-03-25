//lets begin
const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const app = express();
const hbs = require("hbs");
const moment = require("moment");
const bodyParser = require("body-parser");


require('dotenv').config()
dotenv.config();
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({extended:false}));

const template_path = path.join(__dirname, "../templates");
app.set("views", template_path);
app.set("view engine", "hbs");
app.get("/", (req, res) => {
  res.render("index");
});

const PORT  = process.env.PORT || 5000

//mongoose connection

const MONGO_URL = 'mongodb+srv://saurabhkumar:OH95dU2CH7WNA4N2@cluster0.3nv2fxg.mongodb.net/taskmanagerdata?retryWrites=true&w=majority'

//const uri = process.env.MONGO_URL
//console.log(uri);
const mongoose = require("mongoose");

mongoose.set('strictQuery',false);
const db = mongoose.connection;
mongoose.connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  
    console.log("we are connected to the mongodb atlas taskmanagerdata database");
});

app.listen(PORT, console.log(`server is running at ${PORT}`));

//creating schema for task
const Schema = mongoose.Schema; 
// schema for tasklist
const taskListSchema = new Schema({
    Name: {
        type: String,
        required: true
      },
      Description: {
        type: String,
        required: true
      },
      Active: {
        type: Boolean,
        required: true
      },
      tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }]
  });
  
 const TaskList = new mongoose.model('TaskList', taskListSchema);

 //schema for taskdetails
 const taskSchema = new Schema({
    name: {
        type: String,
        required: true
      },
      description: {
        type: String,
        required: true
      },
      dueDate: {
        type: Date,
        required: true
      },
      period: {
        type: String,
        required: true
      },
      periodType: {
        type: String,
        enum: ['monthly', 'quarterly', 'yearly'],
        required: true
      },
      taskListId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskList ',
        required: true
      }
  });
  
  const Task =new mongoose.model('Task', taskSchema);


  //api for creating task

  app.post('/api/createtasklist', (req, res) => {
    const { Name, Description } = req.body;
    if (!Name || !Description) {
      return res.status(422).send("Please fill in all fields.");
    }
    try {
      const taskList = new TaskList({
        Name,
        Description,
        Active: Boolean(req.body.Active),
      });
      taskList.save().then((savedTaskList) => {
    
        res.redirect(`/taskcreated?taskListId=${savedTaskList._id}`);
      });
    } catch (err) {
      console.log(err);
    }
  });
  
  app.get("/taskcreated", (req, res) => {
    const taskListId = req.query.taskListId;
    const para ={
      message: 'your tasklist created with Task List ID:',
      createnewtasklist: 'create new tasklist',
      createtask: 'create task for this id'
    }
    
    res.render("index", { taskListId , para});
  });
  app.get("/createnewtask", (req, res) =>{
    res.render("index");
  });
  app.get("/searchtask", (req, res) =>{
     res.render("searchtask");
  });

  //api for creatingtask
  //const ObjectId = mongoose.Types.ObjectId;
  app.post('/api/createtask', async (req, res) => {
    try {
      const { name, description, dueDate, period, periodType, taskListId } = req.body;
      const taskList = await TaskList.findById(taskListId);
      //console.log(taskList);
      if (!taskList) {
        return res.status(400).json({ message: 'Invalid task list ID' });
      }
      if (!taskList.tasks) {
        taskList.tasks = [];
      }
      let periodFormat;
      switch (periodType) {
        case 'monthly':
          periodFormat = 'MMM YYYY';
          break;
        case 'quarterly':
          periodFormat = '[Q]Q YYYY';
          break;
        case 'yearly':
          periodFormat = 'YYYY';
          break;
        default:
          return res.status(400).json({ message: 'Invalid period type' });
      }
  
      if (!moment(period, periodFormat, true).isValid()) {
        return res.status(400).json({ message: `Invalid period format for ${periodType} period type` });
      }
  
      // Validate due date is after end of period
      const periodMoment = moment(period, periodFormat);
     
      const endOfPeriod = periodMoment.endOf(periodType).toDate();
      
      const dueDateMoment = moment(dueDate, 'DD-MM-YYYY');
      if (!dueDateMoment.isAfter(endOfPeriod)) {
        return res.status(400).json({ message: 'Due date should be after end of period' });
      }
      const dueDateISO =  dueDateMoment.toISOString();
  
      // Save task
      const task = new Task({
        name,
        description,
        dueDate: dueDateISO,
        period,
        periodType,
        taskListId: taskList._id
      });
      await task.save();

      taskList.tasks.push(task._id);
      await taskList.save();
      //const task1 = await Task.findOne({taskListId: "6410287b2fff5c0eee062fde" });
     // console.log(task1);
     // console.log(taskList);
      res.status(201).send("your task has been created");

    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


//api for searchtasks
  
app.get('/api/tasklist', async (req, res) => {
  try {
    const { page = 1, limit = 10, searchText } = req.query;
    const skip = (page - 1) * limit;

    const tasksQuery = Task.find({
      $or: [
        { name: { $regex: searchText, $options: 'i' } },
        { description: { $regex: searchText, $options: 'i' } },
      ]
    }, {
      name: 1,
      description: 1,
      periodType: 1,
      period: 1,
      dueDate: 1,
      taskListId: 1,
    })
    .sort({ dueDate: 1 })
    .skip(skip)
    .limit(Number(limit));

    const tasks = await tasksQuery.exec();
    const count = await Task.countDocuments();

    if (tasks.length === 0) {
     res.send(`no task found for this  task name or description  ${searchText}`);
    }

    const taskListIds = tasks.map(task => task.taskListId);
    const taskLists = await TaskList.find({
      _id: { $in: taskListIds }
    }, { Name: 1 });

    const taskListsMap = taskLists.reduce((map, taskList) => {
      map[taskList._id] = taskList;
      return map;
    }, {});

    const hasPrevPage = page > 1;
    const prevPage = hasPrevPage ? page - 1 : undefined;
    const hasNextPage = skip + Number(limit) < count;
    const nextPage = hasNextPage ? page + 1 : undefined;

    res.render('searchtask', {
      tasks: tasks.map((task) => ({
        name: task.name,
        description: task.description,
        periodType: task.periodType,
        period: task.period,
        dueDate: task.dueDate.toLocaleDateString('en-IN'),
        taskListName: taskListsMap[task.taskListId] ? taskListsMap[task.taskListId].Name : ''
      })),
      count,
      hasPrevPage,
      prevPage,
      hasNextPage,
      nextPage,
      searchText
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});
     

//Thankyou


