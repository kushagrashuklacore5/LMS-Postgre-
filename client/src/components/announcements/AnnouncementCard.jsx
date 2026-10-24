import { Bell } from "lucide-react";

const AnnouncementCard = ({ announcement, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="p-3 border-b hover:bg-gray-50 cursor-pointer"
    >
      <div className="flex items-start gap-2">
        <Bell size={14} className="text-primary mt-1" />
        <div>
          <p className="font-medium text-sm">{announcement.title}</p>
          <p className="text-xs text-gray-600 line-clamp-2">
            {announcement.content || announcement.message}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementCard;
