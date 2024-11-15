import { User } from "../models/userModel.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { Report } from "../models/reportModel.js";
import { Updates } from "../models/updatesModel.js";
import {
  submitAbuseReportOnBC,
  getReport,
  getReportCount,
} from "../blockchain.js";

const generateRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return refreshToken;
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access token"
    );
  }
};

// user registration
const registerUser = asyncHandler(async (req, res) => {
  let { name, phone, password, address, city, state } = req.body;

  // check if any field is empty if it is then throw error
  if (
    [name, phone, password, address, , city, state].some(
      (field) => field?.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are requried");
  }

  [name, phone, password, address] = [name, phone, password, address].map(
    (str) => str.trim()
  );

  // check if user already exists
  const existedUser = await User.findOne({ phone });
  if (existedUser) {
    throw new ApiError(409, "user with phone number or email already exits");
  }

  // creat new user
  const createdUser = await User.create({
    name,
    phone,
    password,
    address,
    city,
    state,
  });
  const loggedInUser = await User.findById(createdUser._id).select("-password");

  return res.status(200).json({
    success: true,
    message: "Register successfully",
    user: loggedInUser,
  });
});

// user login
const loginUser = asyncHandler(async (req, res) => {
  let { phone, password } = req.body;

  if (!phone) {
    throw new ApiError(400, "phone is required");
  }

  const user = await User.findOne({ phone });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const refreshToken = await generateRefreshToken(user._id);
  const loggedInUser = await User.findById(user._id).select("-password");

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res.status(200).cookie("refreshToken", refreshToken, options).json({
    success: true,
    message: "Logged in successfully",
    user: loggedInUser,
  });
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res.status(200).clearCookie("refreshToken", options).json({
    success: true,
    message: "Logged out successfully",
  });
});

// submit abuse report
const submitAbuseReport = asyncHandler(async (req, res) => {
  let {
    victimName,
    phoneNumber,
    abuseType,
    gender,
    age,
    incidentLocation,
    incidentCity,
    incidentState,
    incidentDate,
    description,
    evidence,
  } = req.body;

  const userId = req.user._id;

  // const newReport = await Report.create({
  //   victimName,
  //   phoneNumber,
  //   abuseType,
  //   gender,
  //   age,
  //   incidentLocation,
  //   incidentCity,
  //   incidentState,
  //   incidentDate,
  //   description,
  //   userId,
  // });

  if (!evidence) {
    evidence = [];
  }

  const response = await submitAbuseReportOnBC({
    victimName,
    phoneNumber,
    abuseType,
    gender,
    age,
    incidentLocation,
    incidentCity,
    incidentState,
    incidentDate,
    description,
    evidence,
  });
  console.log(response);

  const newReport = await Report.create({
    nft: response.reportId,
    userId,
    txHash: response.txHash,
  });

  res.status(200).json({
    success: true,
    newReport,
  });
});

// get submited Reorts
const getSubmitedReports = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId != req.user._id) {
    throw new ApiError(404, "Unauthorized access!!");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User does not exists");
  }

  const reports = await Report.find({ userId: userId });

  const finalResponse = await Promise.all(
    reports.map(async (report) => {
      const response = await getReport(report.nft);

      return {
        _id: report._id,
        nft: report.nft,
        userId: report.userId,

        victimName: response[0],
        phoneNumber: response[1],
        abuseType: response[2],
        gender: response[3],
        age: response[4].toString(),
        incidentLocation: response[5],
        incidentCity: response[6],
        incidentState: response[7],
        incidentDate: response[8],
        description: response[9],
        evidence: response[10],

        status: report.status,
        seen: report.seen,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      };
    })
  );

  res.status(200).json({
    success: true,
    reports: finalResponse,
  });
});

// get Single Report
const getSingleReport = asyncHandler(async (req, res) => {
  const { reportId } = req.params;

  const report = await Report.findById(reportId);

  if (!report) {
    throw new ApiError(404, "Report does not exists");
  }

  if (req.user._id.toString() !== report.userId.toString()) {
    throw new ApiError(404, "Unauthorized access!!");
  }

  const response = await getReport(report.nft);

  res.status(200).json({
    success: true,
    report: {
      _id: report._id,
      nft: report.nft,
      userId: report.userId,

      victimName: response[0],
      phoneNumber: response[1],
      abuseType: response[2],
      gender: response[3],
      age: response[4].toString(),
      incidentLocation: response[5],
      incidentCity: response[6],
      incidentState: response[7],
      incidentDate: response[8],
      description: response[9],
      evidence: response[10],

      status: report.status,
      seen: report.seen,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    },
  });
});

// get User details
const getUserDetails = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");

  res.status(200).json({
    success: true,
    user,
  });
});

// give Updates on report
const giveCommitOnReport = asyncHandler(async (req, res) => {
  const { reportId, msg } = req.body;

  const report = await Report.findById(reportId);

  if (!report) {
    throw new ApiError(404, "Report does not exists");
  }

  if (report.userId.toString() != req.user._id.toString()) {
    throw new ApiError(404, "Unauthorized access!!");
  }

  const newCommite = await Updates.create({ reportId, msg, role: "user" });

  res.status(201).json({
    success: true,
    newCommite,
  });
});

// get updates & commite
const getUpdatesAndCommits = asyncHandler(async (req, res) => {
  const { reportId } = req.params;

  const report = await Report.findById(reportId);

  if (!report) {
    throw new ApiError(404, "Report does not exists");
  }

  if (report.userId.toString() != req.user._id.toString()) {
    throw new ApiError(404, "Unauthorized access!!");
  }

  const updatesAndCommites = await Updates.find({ reportId });

  res.status(201).json({
    success: true,
    updatesAndCommites,
  });
});

export {
  registerUser,
  loginUser,
  logoutUser,
  submitAbuseReport,
  getSubmitedReports,
  getSingleReport,
  getUserDetails,
  giveCommitOnReport,
  getUpdatesAndCommits,
};
