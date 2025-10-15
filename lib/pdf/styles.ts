import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 30,
    fontSize: 12,
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  messageContainer: {
    marginBottom: 15,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 18,
    marginBottom: 8,
    maxWidth: "70%",
  },
  sentMessage: {
    backgroundColor: "#007AFF",
    color: "#FFFFFF",
    alignSelf: "flex-end",
    marginLeft: "30%",
  },
  receivedMessage: {
    backgroundColor: "#E5E5EA",
    color: "#000000",
    alignSelf: "flex-start",
    marginRight: "30%",
  },
  messageText: {
    fontSize: 12,
    lineHeight: 1.4,
  },
  timestamp: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "right",
  },
  receivedTimestamp: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "left",
  },
  attachment: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: 8,
    fontSize: 10,
  },
  imagePlaceholder: {
    width: 200,
    height: 150,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  imageText: {
    fontSize: 10,
    color: "#6B7280",
  },
  reaction: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
    fontStyle: "italic",
  },
  pageNumber: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: "center",
    fontSize: 10,
    color: "#6B7280",
  },
  dateSeparator: {
    textAlign: "center",
    fontSize: 10,
    color: "#6B7280",
    marginVertical: 10,
    fontStyle: "italic",
  },
});
