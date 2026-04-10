import os
import shutil
import time
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("cleanup")

def cleanup_old_datasets(base_dir="ml_engine", days_old=7):
    """
    Removes dataset versions older than `days_old` days.
    """
    datasets_dir = os.path.join(base_dir, "data", "datasets")
    if not os.path.exists(datasets_dir):
        logger.info("No datasets directory found.")
        return
        
    current_time = time.time()
    deleted_count = 0
    
    for item in os.listdir(datasets_dir):
        item_path = os.path.join(datasets_dir, item)
        if os.path.isdir(item_path):
            # Check modification time
            mtime = os.path.getmtime(item_path)
            age_days = (current_time - mtime) / (24 * 3600)
            
            if age_days > days_old:
                try:
                    shutil.rmtree(item_path)
                    logger.info(f"Deleted old dataset: {item} (Age: {age_days:.1f} days)")
                    deleted_count += 1
                except Exception as e:
                    logger.error(f"Failed to delete {item}: {str(e)}")
                    
    logger.info(f"Cleanup complete. Removed {deleted_count} dataset(s).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cleanup old datasets")
    parser.add_argument("--days", type=int, default=7, help="Threshold in days to keep datasets")
    parser.add_argument("--dir", type=str, default=".", help="Base ml_engine directory")
    args = parser.parse_args()
    
    cleanup_old_datasets(args.dir, args.days)
